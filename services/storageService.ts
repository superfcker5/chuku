import { InventoryItem, OutboundRecord } from '../types';
import { dbService } from './db';

const LEGACY_KEYS = {
  INVENTORY: 'pyro_inventory_v1',
  HISTORY: 'pyro_history_v1',
};

// --- MIGRATION UTILS ---
const migrateLegacyData = async () => {
  try {
    // Check if we have legacy data
    const rawInv = localStorage.getItem(LEGACY_KEYS.INVENTORY);
    const rawHis = localStorage.getItem(LEGACY_KEYS.HISTORY);

    if (rawInv) {
      const items = JSON.parse(rawInv);
      if (Array.isArray(items) && items.length > 0) {
        console.log("Migrating Inventory to DB...");
        await dbService.saveAll(dbService.STORES.INVENTORY, items);
      }
      localStorage.removeItem(LEGACY_KEYS.INVENTORY);
    }

    if (rawHis) {
      const records = JSON.parse(rawHis);
      if (Array.isArray(records) && records.length > 0) {
        console.log("Migrating History to DB...");
        await dbService.saveAll(dbService.STORES.HISTORY, records);
      }
      localStorage.removeItem(LEGACY_KEYS.HISTORY);
    }
  } catch (e) {
    console.error("Migration failed", e);
  }
};

// --- ASYNC OPERATIONS ---

export const saveInventory = async (items: InventoryItem[]) => {
  try {
    await dbService.saveAll(dbService.STORES.INVENTORY, items);
  } catch (e) {
    console.error("Failed to save inventory to DB", e);
  }
};

export const loadInventory = async (): Promise<InventoryItem[]> => {
  try {
    // Check for migration first
    if (localStorage.getItem(LEGACY_KEYS.INVENTORY)) {
      await migrateLegacyData();
    }
    return await dbService.getAll<InventoryItem>(dbService.STORES.INVENTORY);
  } catch (e) {
    console.error("Failed to load inventory", e);
    return [];
  }
};

export const saveHistory = async (records: OutboundRecord[]) => {
  try {
    await dbService.saveAll(dbService.STORES.HISTORY, records);
  } catch (e) {
    console.error("Failed to save history to DB", e);
  }
};

export const loadHistory = async (): Promise<OutboundRecord[]> => {
  try {
    if (localStorage.getItem(LEGACY_KEYS.HISTORY)) {
      await migrateLegacyData();
    }
    return await dbService.getAll<OutboundRecord>(dbService.STORES.HISTORY);
  } catch (e) {
    console.error("Failed to load history", e);
    return [];
  }
};

export const exportData = async () => {
  const inventory = await loadInventory();
  const history = await loadHistory();
  
  const data = {
    inventory,
    history,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pyrotrack_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

// Helper to download CSV with BOM for Excel compatibility
const downloadCSV = (content: string, filename: string) => {
  const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const downloadInventoryTemplate = () => {
  const headers = [
    "商品名称", 
    "规格(每箱个数)", 
    "成本价(每箱)", "成本价(单个)",
    "批发价(每箱)", "批发价(单个)",
    "零售价(每箱)", "零售价(单个)",
    "库存数量(爽)", "库存数量(峰)"
  ];
  const sample = [
    "示例商品-黄金加特林", 
    "10", 
    "200", "20",
    "220", "22",
    "250", "25",
    "50", "20"
  ];
  const csvContent = [headers.join(","), sample.join(",")].join("\n");
  downloadCSV(csvContent, "库存导入模板_双仓版.csv");
};

// --- HISTORY EXPORTS (Client-side data processing, no changes needed for params) ---

export const exportHistoryToCSV = (records: OutboundRecord[]) => {
  // Simplified columns per request
  const headers = [
      "日期", "经手人/客户", 
      "商品名称", "数量(箱)", "数量(个)", 
      "订单总应收(元)", "订单总实收(元)", "订单总批发(元)", "订单总成本(元)"
  ];
  
  // Flatten records to item level
  const rows = records.flatMap(record => 
    record.items.map(item => {
      const actualReceived = record.actualReceived ?? record.totalSale;
      
      // Handle legacy totals fallback
      const totalCost = record.totalCostValue || record.items.reduce((s, i) => s + (i.costTotal||0), 0);
      const totalWholesale = record.totalWholesaleValue || record.items.reduce((s, i) => s + (i.wholesaleTotal||0), 0);

      return [
        `"${record.date}"`,
        `"${record.person}"`,
        `"${item.productName}"`,
        item.qtyBoxes,
        item.qtyUnits,
        record.totalSale,    // Order Total Receivable
        actualReceived,      // Order Actual Received
        totalWholesale,      // Order Total Wholesale
        totalCost            // Order Total Cost
      ].join(",");
    })
  );

  const csvContent = [headers.join(","), ...rows].join("\n");
  downloadCSV(csvContent, `出库明细_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
};

export const exportHistorySummaryToCSV = (records: OutboundRecord[]) => {
  const stats: Record<string, any> = {};
  
  records.forEach(r => {
      const p = r.person;
      if (!stats[p]) {
          stats[p] = { 
              name: p, count: 0, sales: 0, 
              cost: 0, wholesale: 0, 
              baseProfit: 0, wholesaleSurplus: 0, personalExtra: 0 
          };
      }
      const received = r.actualReceived ?? r.totalSale;
      stats[p].count++;
      stats[p].sales += received;
      // Handle legacy or missing totals by summing items if necessary
      const rCost = r.totalCostValue || r.items.reduce((s, i) => s + (i.costTotal||0), 0);
      const rWholesale = r.totalWholesaleValue || r.items.reduce((s, i) => s + (i.wholesaleTotal||0), 0);
      
      stats[p].cost += rCost;
      stats[p].wholesale += rWholesale;
      stats[p].baseProfit += (r.totalBaseProfit ?? r.totalCostProfit ?? 0);
      stats[p].wholesaleSurplus += (r.totalWholesaleSurplus ?? r.totalWholesaleProfit ?? 0);
      stats[p].personalExtra += (r.totalPersonalExtra || 0);
  });

  const headers = [
      "经手人/客户", "订单数", "总实收金额", 
      "总成本", "总批发额", 
      "成本利润", "批发收益", "个人额外"
  ];

  const rows = Object.values(stats).map(s => [
      `"${s.name}"`, 
      s.count, 
      s.sales.toFixed(2), 
      s.cost.toFixed(2), 
      s.wholesale.toFixed(2), 
      s.baseProfit.toFixed(2), 
      s.wholesaleSurplus.toFixed(2), 
      s.personalExtra.toFixed(2)
  ].join(","));

  const csvContent = [headers.join(","), ...rows].join("\n");
  downloadCSV(csvContent, `出库汇总(经手人)_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
};

// --- INVENTORY EXPORTS ---

export const exportInventoryToCSV = (items: InventoryItem[]) => {
    const headers = [
        "商品名称", "规格(个/箱)", 
        "成本价(箱)", "成本价(个)",
        "批发价(箱)", "批发价(个)",
        "零售价(箱)", "零售价(个)",
        "爽仓库存(箱)", "爽仓库存(个)",
        "峰仓库存(箱)", "峰仓库存(个)"
    ];

    const rows = items.map(item => [
        `"${item.name}"`, item.spec,
        item.costPriceBox, item.costPriceUnit,
        item.wholesalePriceBox, item.wholesalePriceUnit,
        item.retailPriceBox, item.retailPriceUnit,
        item.stockShuangBoxes, item.stockShuangUnits,
        item.stockFengBoxes, item.stockFengUnits
    ].join(","));

    const csvContent = [headers.join(","), ...rows].join("\n");
    downloadCSV(csvContent, `库存明细_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
};