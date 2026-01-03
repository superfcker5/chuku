export interface InventoryItem {
  id: string;
  name: string;
  spec: number; // Items per box
  
  // Box Prices
  costPriceBox: number;
  wholesalePriceBox: number;
  retailPriceBox: number; 
  
  // Unit Prices
  costPriceUnit: number;
  wholesalePriceUnit: number;
  retailPriceUnit: number;

  // Warehouse 1: Shuang (爽)
  stockShuangBoxes: number;
  stockShuangUnits: number;

  // Warehouse 2: Feng (峰)
  stockFengBoxes: number;
  stockFengUnits: number;
}

export interface OutboundItemParsed {
  rawLine: string;
  productName: string;
  qtyBoxes: number; // Total Boxes
  qtyUnits: number; // Total Units
  soldPrice: number;
  matchedInventoryId?: string;
  
  // UI State for allocation (Default Feng=Total, Shuang=0)
  assignedShuangBoxes?: number;
  assignedShuangUnits?: number;
}

export interface OutboundRecord {
  id: string;
  date: string;
  person: string;
  warehouse?: string; // DEPRECATED: Now per-item
  items: {
    invId?: string;
    productName: string;
    
    // Total Sold
    qtyBoxes: number;
    qtyUnits: number;
    
    // Warehouse Split (Saved)
    outShuangBoxes: number;
    outShuangUnits: number;
    outFengBoxes: number;
    outFengUnits: number;

    // Remaining Stock Snapshot (After this transaction)
    remainingShuangBoxes: number;
    remainingShuangUnits: number;
    remainingFengBoxes: number;
    remainingFengUnits: number;

    soldPrice: number;
    costTotal: number;
    wholesaleTotal: number;
    retailTotal: number;
  }[];
  totalSale: number;
  actualReceived: number;
  
  // Financial Totals
  totalCostValue: number;       // New: Total Cost Value of this order
  totalWholesaleValue: number;  // New: Total Wholesale Value of this order

  // Legacy fields
  totalCostProfit: number; 
  totalWholesaleProfit: number;

  // New Logic Fields
  totalBaseProfit: number;
  totalWholesaleSurplus: number;
  totalPersonalExtra: number;
  
  rawText: string;
}

export interface ImportPreviewItem {
  name: string;
  spec: number;
  
  costPriceBox: number;
  costPriceUnit: number;
  
  wholesalePriceBox: number;
  wholesalePriceUnit: number;
  
  retailPriceBox: number;
  retailPriceUnit: number;

  stockShuangBoxes: number; 
  stockFengBoxes: number;   
}