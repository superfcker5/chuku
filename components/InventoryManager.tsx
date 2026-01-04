import React, { useState, useRef } from 'react';
import { InventoryItem, ImportPreviewItem } from '../types';
import { Plus, Edit2, Trash2, Save, X, Upload, FileSpreadsheet, BrainCircuit, RefreshCw, Box, PackagePlus, AlertTriangle, ChevronDown, Download } from 'lucide-react';
import { parseInventoryImport } from '../services/geminiService';
import { downloadInventoryTemplate, exportInventoryToCSV } from '../services/storageService';
import * as XLSX from 'xlsx';

interface Props {
  inventory: InventoryItem[];
  setInventory: (items: InventoryItem[]) => void;
}

const InventoryManager: React.FC<Props> = ({ inventory, setInventory }) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempItem, setTempItem] = useState<Partial<InventoryItem>>({});
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
  const [importMode, setImportMode] = useState<'overwrite' | 'add'>('overwrite'); 
  const [importText, setImportText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleEdit = (item: InventoryItem) => {
    setEditingId(item.id);
    setTempItem({ ...item });
  };

  const handleAddNew = () => {
    const newItem: InventoryItem = {
      id: crypto.randomUUID(),
      name: '新商品',
      spec: 1,
      costPriceBox: 0, costPriceUnit: 0,
      wholesalePriceBox: 0, wholesalePriceUnit: 0,
      retailPriceBox: 0, retailPriceUnit: 0,
      stockShuangBoxes: 0, stockShuangUnits: 0,
      stockFengBoxes: 0, stockFengUnits: 0,
    };
    // Prepend new item to the beginning of the list (Req: 添加商品放在开头)
    setInventory([newItem, ...inventory]);
    setEditingId(newItem.id);
    setTempItem(newItem);
  };

  const normalizeStock = (boxes: number, units: number, spec: number) => {
      const safeSpec = spec > 0 ? spec : 1;
      const total = (boxes * safeSpec) + units;
      const normBoxes = Math.trunc(total / safeSpec);
      const normUnits = Number((total % safeSpec).toFixed(4)); 
      return { boxes: normBoxes, units: normUnits };
  };

  const calculateUnitP = (boxP: number, spec: number) => {
      if (!boxP || !spec) return 0;
      return Number((boxP / spec).toFixed(2));
  };

  const handleSave = () => {
    if (!tempItem.name || editingId === null) return;
    const sanitizedName = tempItem.name.replace(/[\r\n]+/g, '').trim();
    
    const spec = tempItem.spec && tempItem.spec > 0 ? Number(tempItem.spec) : 1;
    
    // Normalize Shuang Stock
    const rawShuangBoxes = Number(tempItem.stockShuangBoxes) || 0;
    const rawShuangUnits = Number(tempItem.stockShuangUnits) || 0;
    const shuang = normalizeStock(rawShuangBoxes, rawShuangUnits, spec);

    // Normalize Feng Stock
    const rawFengBoxes = Number(tempItem.stockFengBoxes) || 0;
    const rawFengUnits = Number(tempItem.stockFengUnits) || 0;
    const feng = normalizeStock(rawFengBoxes, rawFengUnits, spec);

    // Price Logic
    const finalCostBox = Number(tempItem.costPriceBox) || 0;
    const finalWholesaleBox = Number(tempItem.wholesalePriceBox) || 0;
    const finalRetailBox = Number(tempItem.retailPriceBox) || 0;

    const finalCostUnit = (tempItem.costPriceUnit && tempItem.costPriceUnit > 0) 
        ? Number(tempItem.costPriceUnit) : calculateUnitP(finalCostBox, spec);

    const finalWholesaleUnit = (tempItem.wholesalePriceUnit && tempItem.wholesalePriceUnit > 0)
        ? Number(tempItem.wholesalePriceUnit) : calculateUnitP(finalWholesaleBox, spec);
        
    const finalRetailUnit = (tempItem.retailPriceUnit && tempItem.retailPriceUnit > 0)
        ? Number(tempItem.retailPriceUnit) : calculateUnitP(finalRetailBox, spec);

    const updated = inventory.map(item => 
      item.id === editingId ? { 
          ...item, 
          ...tempItem, 
          name: sanitizedName,
          spec: spec,
          
          stockShuangBoxes: shuang.boxes,
          stockShuangUnits: shuang.units,
          stockFengBoxes: feng.boxes,
          stockFengUnits: feng.units,

          costPriceBox: finalCostBox,
          wholesalePriceBox: finalWholesaleBox,
          retailPriceBox: finalRetailBox,
          costPriceUnit: finalCostUnit,
          wholesalePriceUnit: finalWholesaleUnit,
          retailPriceUnit: finalRetailUnit
      } as InventoryItem : item
    );
    setInventory(updated);
    setEditingId(null);
    setTempItem({});
  };

  const handleDelete = (id: string) => {
    if (window.confirm("确定要删除这个商品吗？")) {
      setInventory(inventory.filter(i => i.id !== id));
    }
  };

  const processImportData = (items: ImportPreviewItem[]) => {
    // 1. Map existing inventory for fast lookup by name. Map preserves insertion order.
    const existingMap = new Map<string, InventoryItem>();
    inventory.forEach(item => existingMap.set(item.name, item));
    
    // 2. Build a new list that follows the IMPORT FILE ORDER (Req: 以导入表格顺序为准)
    const newOrderedInventory: InventoryItem[] = [];
    
    let addedCount = 0;
    let mergedCount = 0;

    items.forEach(p => {
        const name = p.name ? p.name.replace(/[\r\n]+/g, '').trim() : '';
        if (!name) return;

        const pSpec = p.spec || 1;
        
        const pShuangBoxes = p.stockShuangBoxes || 0;
        const pFengBoxes = p.stockFengBoxes || 0;
        
        // Use incoming spec to calc totals
        const incomingTotalShuang = pShuangBoxes * pSpec;
        const incomingTotalFeng = pFengBoxes * pSpec;

        // Auto-calc unit prices
        const pCostUnit = p.costPriceUnit > 0 ? p.costPriceUnit : (p.costPriceBox / pSpec);
        const pWholesaleUnit = p.wholesalePriceUnit > 0 ? p.wholesalePriceUnit : (p.wholesalePriceBox / pSpec);
        const pRetailBox = p.retailPriceBox > 0 ? p.retailPriceBox : p.wholesalePriceBox;
        const pRetailUnit = p.retailPriceUnit > 0 ? p.retailPriceUnit : (pRetailBox / pSpec);

        if (existingMap.has(name)) {
            // MERGE: Item exists, take ID and merge props
            const item = existingMap.get(name)!;
            // Use spec from file if valid, else keep existing
            const finalSpec = p.spec > 0 ? p.spec : item.spec;
            
            let newTotalShuang = 0;
            let newTotalFeng = 0;

            if (importMode === 'add') {
                const curShuang = ((item.stockShuangBoxes||0) * item.spec) + (item.stockShuangUnits||0);
                const curFeng = ((item.stockFengBoxes||0) * item.spec) + (item.stockFengUnits||0);
                newTotalShuang = curShuang + incomingTotalShuang;
                newTotalFeng = curFeng + incomingTotalFeng;
            } else {
                newTotalShuang = incomingTotalShuang;
                newTotalFeng = incomingTotalFeng;
            }

            const shuang = normalizeStock(0, newTotalShuang, finalSpec);
            const feng = normalizeStock(0, newTotalFeng, finalSpec);
            
            const updatedItem: InventoryItem = {
                ...item,
                spec: finalSpec,
                
                costPriceBox: p.costPriceBox > 0 ? p.costPriceBox : item.costPriceBox,
                wholesalePriceBox: p.wholesalePriceBox > 0 ? p.wholesalePriceBox : item.wholesalePriceBox,
                retailPriceBox: p.retailPriceBox > 0 ? p.retailPriceBox : item.retailPriceBox,
                
                costPriceUnit: p.costPriceUnit ? p.costPriceUnit : (p.costPriceBox ? pCostUnit : item.costPriceUnit),
                wholesalePriceUnit: p.wholesalePriceUnit ? p.wholesalePriceUnit : (p.wholesalePriceBox ? pWholesaleUnit : item.wholesalePriceUnit),
                retailPriceUnit: p.retailPriceUnit ? p.retailPriceUnit : (p.retailPriceBox ? pRetailUnit : item.retailPriceUnit),

                stockShuangBoxes: shuang.boxes,
                stockShuangUnits: shuang.units,
                stockFengBoxes: feng.boxes,
                stockFengUnits: feng.units
            };
            
            newOrderedInventory.push(updatedItem);
            existingMap.delete(name); // Remove from map so we know it's handled
            mergedCount++;
        } else {
            // NEW: Create item and push to list (in file order)
            // Calc standard stock
            const shuang = normalizeStock(0, incomingTotalShuang, pSpec);
            const feng = normalizeStock(0, incomingTotalFeng, pSpec);

            const newItem: InventoryItem = {
                id: crypto.randomUUID(),
                name: name,
                spec: pSpec,
                costPriceBox: p.costPriceBox || 0,
                wholesalePriceBox: p.wholesalePriceBox || 0,
                retailPriceBox: pRetailBox || 0,
                costPriceUnit: Number(pCostUnit.toFixed(2)) || 0,
                wholesalePriceUnit: Number(pWholesaleUnit.toFixed(2)) || 0,
                retailPriceUnit: Number(pRetailUnit.toFixed(2)) || 0,
                
                stockShuangBoxes: shuang.boxes,
                stockShuangUnits: shuang.units,
                stockFengBoxes: feng.boxes,
                stockFengUnits: feng.units
            };
            newOrderedInventory.push(newItem);
            addedCount++;
        }
    });

    // 3. Append remaining items (items in DB but NOT in import file) to the end
    // This preserves them while respecting the import file's primary order.
    // Map values iteration respects insertion order of original inventory.
    const remainingItems = Array.from(existingMap.values());
    
    // 4. Update State
    setInventory([...newOrderedInventory, ...remainingItems]);
    
    setIsImportModalOpen(false);
    setImportText('');
    const actionText = importMode === 'add' ? '增加库存' : '更新/覆盖库存';
    alert(`操作完成！\n新增商品: ${addedCount} 个\n${actionText}: ${mergedCount} 个\n(列表顺序已更新为表格顺序，未包含的商品已移至末尾)`);
  };

  const handleAIImport = async () => {
    if (!importText.trim()) return;
    setIsParsing(true);
    try {
      const parsedData = await parseInventoryImport(importText);
      if (parsedData && parsedData.length > 0) {
        processImportData(parsedData);
      } else {
        alert("DeepSeek 未识别到有效数据，请检查文本格式。");
      }
    } catch (e: any) {
      alert(`解析失败: ${e.message}\n请检查 DeepSeek API Key 配置。`);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        
        // Intelligent Header Search
        let startIndex = -1;
        for(let i=0; i<Math.min(data.length, 5); i++) {
            const rowStr = data[i].join(' ').toLowerCase();
            if (rowStr.includes('名称') || rowStr.includes('name') || rowStr.includes('品名')) {
                startIndex = i + 1;
                break;
            }
        }
        
        if (startIndex === -1) {
             if (data.length > 0 && typeof data[0][0] === 'string' && !isNaN(Number(data[0][1]))) {
                 startIndex = 0;
             } else {
                 startIndex = 1;
             }
        }

        const parsedItems: ImportPreviewItem[] = [];
        for (let i = startIndex; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;
            
            const name = row[0] ? String(row[0]).replace(/[\r\n]+/g, '').trim() : '';
            if (!name) continue;

            // Updated Column Mapping based on request:
            // 0:Name, 1:Spec
            // Prices: 2:CostBox, 3:CostUnit, 4:WholesaleBox, 5:WholesaleUnit, 6:RetailBox, 7:RetailUnit
            // Stocks: 8:Shuang, 9:Feng
            parsedItems.push({
                name: name,
                spec: Number(row[1]) || 1,
                
                costPriceBox: Number(row[2]) || 0,
                costPriceUnit: Number(row[3]) || 0,
                
                wholesalePriceBox: Number(row[4]) || 0,
                wholesalePriceUnit: Number(row[5]) || 0,
                
                retailPriceBox: Number(row[6]) || 0,
                retailPriceUnit: Number(row[7]) || 0,

                stockShuangBoxes: Number(row[8]) || 0,
                stockFengBoxes: Number(row[9]) || 0,
            });
        }
        
        if (parsedItems.length > 0) {
             processImportData(parsedItems);
        } else {
             alert("表格格式未能直接识别。已将内容加载到文本框，请点击下方的“DeepSeek 识别”进行智能解析。");
             const textRep = data.map(row => row.join(' ')).join('\n');
             setImportText(textRep);
        }

      } catch (err) {
        console.error(err);
        alert("文件读取失败");
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const openImportModal = (mode: 'overwrite' | 'add') => {
      setImportMode(mode);
      setIsImportModalOpen(true);
  };

  const renderStockInput = (
      boxVal: number, setBox: (v: number) => void, 
      unitVal: number, setUnit: (v: number) => void, 
      label: string, colorClass: string
  ) => (
      <div className={`flex gap-1 items-center bg-white p-1 rounded border ${colorClass} text-xs`}>
        <span className="font-bold mr-1">{label}</span>
        <div className="relative">
            <input type="number" className="w-12 p-1 border rounded text-right" value={boxVal} onChange={e => setBox(Number(e.target.value))} />
        </div>
        <span className="text-gray-400">箱</span>
        <div className="relative">
            <input type="number" className="w-10 p-1 border rounded text-right" value={unitVal} onChange={e => setUnit(Number(e.target.value))} />
        </div>
        <span className="text-gray-400">个</span>
      </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex flex-wrap gap-4 justify-between items-center bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-800">库存管理</h2>
        <div className="flex gap-2 relative">
           <button 
                onClick={() => exportInventoryToCSV(inventory)}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 transition text-sm"
            >
                <Download size={16}/> 导出库存
            </button>
            <div className="relative">
                 <button 
                    onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                    className="flex items-center gap-2 px-3 py-2 text-gray-500 hover:text-indigo-600 transition text-sm"
                >
                    <FileSpreadsheet size={16}/> 模板 <ChevronDown size={12}/>
                </button>
                {isTemplateDropdownOpen && (
                     <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsTemplateDropdownOpen(false)}></div>
                        <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-20 py-1">
                            <button 
                                onClick={() => {
                                    downloadInventoryTemplate();
                                    setIsTemplateDropdownOpen(false);
                                }}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                            >
                                下载导入模板
                            </button>
                        </div>
                    </>
                )}
            </div>

           <button 
            onClick={() => openImportModal('overwrite')}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition text-sm"
          >
            <Upload size={16} /> 导入 (更新)
          </button>
           <button 
            onClick={() => openImportModal('add')}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm"
          >
            <PackagePlus size={16} /> 增加库存
          </button>
          <button 
            onClick={handleAddNew}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition text-sm"
          >
            <Plus size={16} /> 新增商品
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-100 text-gray-600 font-medium">
            <tr>
              <th className="px-4 py-3 min-w-[150px]">商品名称</th>
              <th className="px-4 py-3 min-w-[80px]">规格</th>
              <th className="px-4 py-3 min-w-[100px]">成本(箱/个)</th>
              <th className="px-4 py-3 min-w-[100px]">批发(箱/个)</th>
              <th className="px-4 py-3 min-w-[100px]">零售(箱/个)</th>
              <th className="px-4 py-3 min-w-[120px] bg-orange-50 text-orange-800">库存(爽)</th>
              <th className="px-4 py-3 min-w-[120px] bg-blue-50 text-blue-800">库存(峰)</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {inventory.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  暂无库存数据。请手动添加或通过表格导入。
                </td>
              </tr>
            )}
            {inventory.map((item) => {
              const isEditing = editingId === item.id;
              
              const shuangBoxes = item.stockShuangBoxes || 0;
              const shuangUnits = item.stockShuangUnits || 0;
              const fengBoxes = item.stockFengBoxes || 0;
              const fengUnits = item.stockFengUnits || 0;

              if (isEditing) {
                return (
                  <tr key={item.id} className="bg-blue-50/50">
                    <td className="px-4 py-2 align-top">
                      <input 
                        className="w-full p-2 border border-blue-300 rounded focus:ring-2 focus:ring-blue-200 outline-none" 
                        value={tempItem.name} 
                        onChange={e => setTempItem({...tempItem, name: e.target.value})} 
                        placeholder="商品名称"
                        autoFocus
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input type="number" className="w-16 p-2 border border-blue-300 rounded focus:ring-2 focus:ring-blue-200 outline-none" value={tempItem.spec} onChange={e => setTempItem({...tempItem, spec: Number(e.target.value)})} />
                      <div className="text-[10px] text-gray-400 mt-1">个/箱</div>
                    </td>
                    {/* Price Inputs */}
                    <td className="px-4 py-2 align-top space-y-1">
                        <input type="number" className="w-20 p-1 border rounded text-xs" value={tempItem.costPriceBox} onChange={e => setTempItem({...tempItem, costPriceBox: Number(e.target.value)})} placeholder="箱"/>
                        <input type="number" className="w-20 p-1 border rounded text-xs bg-gray-50" value={tempItem.costPriceUnit} onChange={e => setTempItem({...tempItem, costPriceUnit: Number(e.target.value)})} placeholder="个"/>
                    </td>
                    <td className="px-4 py-2 align-top space-y-1">
                        <input type="number" className="w-20 p-1 border rounded text-xs" value={tempItem.wholesalePriceBox} onChange={e => setTempItem({...tempItem, wholesalePriceBox: Number(e.target.value)})} placeholder="箱"/>
                        <input type="number" className="w-20 p-1 border rounded text-xs bg-gray-50" value={tempItem.wholesalePriceUnit} onChange={e => setTempItem({...tempItem, wholesalePriceUnit: Number(e.target.value)})} placeholder="个"/>
                    </td>
                    <td className="px-4 py-2 align-top space-y-1">
                        <input type="number" className="w-20 p-1 border rounded text-xs text-orange-600" value={tempItem.retailPriceBox} onChange={e => setTempItem({...tempItem, retailPriceBox: Number(e.target.value)})} placeholder="箱"/>
                        <input type="number" className="w-20 p-1 border rounded text-xs text-orange-600 bg-gray-50" value={tempItem.retailPriceUnit} onChange={e => setTempItem({...tempItem, retailPriceUnit: Number(e.target.value)})} placeholder="个"/>
                    </td>
                    
                    {/* Stock Inputs */}
                    <td className="px-4 py-2 align-top">
                        {renderStockInput(
                            tempItem.stockShuangBoxes||0, v => setTempItem({...tempItem, stockShuangBoxes: v}),
                            tempItem.stockShuangUnits||0, v => setTempItem({...tempItem, stockShuangUnits: v}),
                            "爽", "border-orange-200 bg-orange-50"
                        )}
                    </td>
                    <td className="px-4 py-2 align-top">
                         {renderStockInput(
                            tempItem.stockFengBoxes||0, v => setTempItem({...tempItem, stockFengBoxes: v}),
                            tempItem.stockFengUnits||0, v => setTempItem({...tempItem, stockFengUnits: v}),
                            "峰", "border-blue-200 bg-blue-50"
                        )}
                    </td>

                    <td className="px-4 py-2 align-top text-right">
                      <button onClick={handleSave} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 mr-2"><Save size={18} /></button>
                      <button onClick={() => setEditingId(null)} className="p-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200"><X size={18} /></button>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={item.id} className="hover:bg-gray-50 transition border-b border-gray-100 last:border-0 group">
                  <td className="px-4 py-3 font-medium text-gray-800 align-top">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600 align-top">
                    <span className="bg-gray-100 px-2 py-0.5 rounded text-xs whitespace-nowrap">1箱={item.spec}个</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono align-top text-xs">
                       <div>B:¥{item.costPriceBox}</div>
                       <div className="text-gray-400">U:¥{item.costPriceUnit}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono align-top text-xs">
                       <div>B:¥{item.wholesalePriceBox}</div>
                       <div className="text-gray-400">U:¥{item.wholesalePriceUnit}</div>
                  </td>
                  <td className="px-4 py-3 text-orange-600 font-mono font-medium align-top text-xs">
                       <div>B:¥{item.retailPriceBox}</div>
                       <div className="text-orange-400">U:¥{item.retailPriceUnit}</div>
                  </td>
                  
                  <td className="px-4 py-3 align-top bg-orange-50/30">
                     <div className="flex items-center gap-1 text-sm font-medium text-gray-800">
                        <span>{shuangBoxes}</span><span className="text-xs text-gray-500">箱</span>
                        {shuangUnits > 0 && <span className="text-xs text-orange-600">+{shuangUnits}</span>}
                     </div>
                  </td>
                   <td className="px-4 py-3 align-top bg-blue-50/30">
                     <div className="flex items-center gap-1 text-sm font-medium text-gray-800">
                        <span>{fengBoxes}</span><span className="text-xs text-gray-500">箱</span>
                        {fengUnits > 0 && <span className="text-xs text-blue-600">+{fengUnits}</span>}
                     </div>
                  </td>

                  <td className="px-4 py-3 text-right opacity-0 group-hover:opacity-100 transition-opacity align-top">
                    <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-800 mr-3 p-1 hover:bg-blue-50 rounded"><Edit2 size={16} /></button>
                    <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[600px] max-w-full shadow-xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                {importMode === 'add' ? (
                    <><PackagePlus className="text-blue-600"/> 增加库存 (补货)</>
                ) : (
                    <><Upload className="text-indigo-600"/> 导入库存 (覆盖/更新)</>
                )}
            </h3>
            
            <div className={`mb-4 p-3 rounded text-sm flex items-start gap-2 ${importMode === 'add' ? 'bg-blue-50 text-blue-800' : 'bg-indigo-50 text-indigo-800'}`}>
                <AlertTriangle size={16} className="mt-0.5 shrink-0"/>
                <div>
                    {importMode === 'add' ? (
                        <p>您当前处于 <strong>增加模式</strong>。表格中的库存数量将与现有库存<strong>累加</strong>。适用于日常进货补货。</p>
                    ) : (
                        <p>您当前处于 <strong>覆盖模式</strong>。表格中的库存数量将<strong>替换</strong>现有库存。适用于初始建库或库存修正。</p>
                    )}
                </div>
            </div>

            <div className="mb-4 space-y-2">
                 <button 
                   onClick={() => fileInputRef.current?.click()}
                   className={`w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg transition cursor-pointer ${importMode === 'add' ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                 >
                    <FileSpreadsheet size={24} />
                    <span>点击上传表格文件 (.xlsx / .csv)</span>
                 </button>
                 <input 
                   type="file" 
                   ref={fileInputRef} 
                   onChange={handleFileUpload} 
                   accept=".xlsx, .xls, .csv" 
                   className="hidden"
                 />
                 <div className="text-xs text-center text-gray-500">
                     支持列顺序: 名称, 规格, 成本(箱/单), 批发(箱/单), 零售(箱/单), 库存(爽), 库存(峰)
                 </div>
            </div>

            <p className="text-sm text-gray-500 mb-2">或粘贴内容（DeepSeek 智能识别）:</p>
            <textarea
              className="w-full h-32 p-3 border rounded mb-4 font-mono text-xs bg-gray-50"
              placeholder={`示例:\n黄金加特林  10/箱  成本:200  批发:220  零售:250  库存:50\n...`}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setIsImportModalOpen(false)} 
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
              >
                取消
              </button>
              <button 
                onClick={handleAIImport}
                disabled={isParsing || !importText.trim()}
                className={`px-4 py-2 text-white rounded disabled:opacity-50 flex items-center gap-2 ${importMode === 'add' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {isParsing ? <RefreshCw className="animate-spin" size={16}/> : <BrainCircuit size={16}/>}
                DeepSeek 识别
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryManager;