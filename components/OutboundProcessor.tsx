import React, { useState, useEffect } from 'react';
import { InventoryItem, OutboundItemParsed, OutboundRecord } from '../types';
import { ArrowRight, Calculator, CheckCircle, AlertCircle, RefreshCw, Settings, AlertTriangle, BrainCircuit, Edit3, User, Wallet, TrendingUp, Warehouse, ArrowRightLeft, Coins } from 'lucide-react';
import { parseOutboundAI } from '../services/geminiService';

interface Props {
  inventory: InventoryItem[];
  onCommit: (record: OutboundRecord) => void;
}

const OutboundProcessor: React.FC<Props> = ({ inventory, onCommit }) => {
  const [inputText, setInputText] = useState('');
  const [parsedDate, setParsedDate] = useState('');
  const [parsedPerson, setParsedPerson] = useState('');
  const [parsedItems, setParsedItems] = useState<OutboundItemParsed[]>([]);
  const [previewMode, setPreviewMode] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  
  const [actualReceivedInput, setActualReceivedInput] = useState<string>('');
  
  const [showAiRecommendation, setShowAiRecommendation] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    setApiKey(localStorage.getItem('PYRO_API_KEY') || '');
  }, [inputText, parsedItems, previewMode]);

  const saveApiKey = () => {
    localStorage.setItem('PYRO_API_KEY', apiKey);
    setShowConfig(false);
    alert("API Key 已保存");
  };

  // UPDATED REGEX LOGIC
  const parseTextRegex = (text: string) => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    // 1. Header Extraction: 📅 2026/1/1 (💁海哥)
    const headerRegex = /📅\s*(.*?)\s*\(\s*[💁|👤]?\s*(.*?)\s*\)/;
    const headerMatch = lines[0].match(headerRegex);
    let date = new Date().toLocaleDateString();
    let person = '未知用户';

    let startIndex = 0;
    if (headerMatch) {
      date = headerMatch[1];
      person = headerMatch[2];
      startIndex = 1;
    }

    // 2. Item Extraction
    // Support "1." or "1、"
    // Support commas in price: 1,200.00
    const itemRegex = /^(\d+)[\.\、]\s*(.+?)[:：]\s*(.+?)\s*=\s*[￥¥]?([\d\.,]+)/;
    
    // Support commas in quantities: 1,000箱
    const boxRegex = /([\d\.,]+)\s*箱/;
    const unitRegex = /([\d\.,]+)\s*个/;

    const items: OutboundItemParsed[] = [];

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('💰') || line.startsWith('总计') || line.includes('总计:')) continue; 

      const match = line.match(itemRegex);
      if (match) {
        const productName = match[2].trim();
        const contentStr = match[3];
        const totalPriceStr = match[4].replace(/,/g, '');

        let qtyBoxes = 0;
        let qtyUnits = 0;

        const boxMatch = contentStr.match(boxRegex);
        if (boxMatch) qtyBoxes = parseFloat(boxMatch[1].replace(/,/g, ''));

        const unitMatch = contentStr.match(unitRegex);
        if (unitMatch) qtyUnits = parseFloat(unitMatch[1].replace(/,/g, ''));

        items.push({
          rawLine: line,
          productName,
          qtyBoxes,
          qtyUnits,
          soldPrice: parseFloat(totalPriceStr) || 0,
          // Initialize Allocation: Shuang = 0
          assignedShuangBoxes: 0,
          assignedShuangUnits: 0
        });
      }
    }

    if (items.length === 0) {
        setShowAiRecommendation(true);
    } else {
        setShowAiRecommendation(false);
        matchAndSetItems(items, date, person);
    }
  };

  const matchAndSetItems = (items: OutboundItemParsed[], date: string, person: string) => {
    const matchedItems = items.map(item => {
      // Fuzzy match logic
      const normalize = (s: string) => s.replace(/[（(].*?[）)]/g, '').trim().toLowerCase();
      
      const match = inventory.find(inv => 
        inv.name.includes(item.productName) || 
        item.productName.includes(inv.name) ||
        normalize(inv.name) === normalize(item.productName)
      );
      return {
        ...item,
        matchedInventoryId: match?.id,
        // Ensure initialization
        assignedShuangBoxes: item.assignedShuangBoxes || 0,
        assignedShuangUnits: item.assignedShuangUnits || 0
      };
    });

    const totalSale = matchedItems.reduce((sum, item) => sum + item.soldPrice, 0);
    setActualReceivedInput(totalSale.toString());

    setParsedDate(date);
    setParsedPerson(person);
    setParsedItems(matchedItems);
    setPreviewMode(true);
  };

  const handleSmartParse = async () => {
    setIsProcessingAI(true);
    setShowAiRecommendation(false);
    try {
        const aiData = await parseOutboundAI(inputText);
        if (aiData) {
             const items = (aiData.items || []).map((aiItem: any) => ({
                rawLine: `${aiItem.productName} (DeepSeek解析)`,
                productName: aiItem.productName,
                qtyBoxes: aiItem.qtyBoxes || 0,
                qtyUnits: aiItem.qtyUnits || 0,
                soldPrice: aiItem.soldPrice || 0,
                assignedShuangBoxes: 0,
                assignedShuangUnits: 0
             }));
             
             matchAndSetItems(items, aiData.date || new Date().toLocaleDateString(), aiData.person || '未知用户');
        }
    } catch(e: any) {
        alert(`AI解析失败: ${e.message}\n请检查右上角 API Key 配置。`);
    } finally {
        setIsProcessingAI(false);
    }
  };

  // Helper to handle allocation changes
  const updateShuangAllocation = (index: number, field: 'assignedShuangBoxes' | 'assignedShuangUnits', value: number) => {
      const newItems = [...parsedItems];
      newItems[index] = {
          ...newItems[index],
          [field]: value
      };
      setParsedItems(newItems);
  };

  const calculateDetails = () => {
    let totalSale = 0;
    let totalCost = 0;
    let totalWholesaleCost = 0;
    let totalRetailValuation = 0;
    let hasCriticalError = false;

    const finalItems = parsedItems.map(pItem => {
      const invItem = inventory.find(i => i.id === pItem.matchedInventoryId);
      
      let costTotal = 0;
      let wholesaleTotal = 0;
      let retailTotal = 0;
      let error = null;

      // Allocation Logic
      const spec = invItem ? invItem.spec : 1;
      
      // Total needed
      const totalNeededUnits = (pItem.qtyBoxes * spec) + pItem.qtyUnits;
      
      // Shuang allocated (Input by user)
      const shuangAllocatedUnits = ((pItem.assignedShuangBoxes || 0) * spec) + (pItem.assignedShuangUnits || 0);
      
      // Feng allocated (Remaining)
      const fengAllocatedUnits = totalNeededUnits - shuangAllocatedUnits;
      
      // Convert Feng back to Box/Unit for display/storage
      const fengBoxes = Math.trunc(fengAllocatedUnits / spec);
      const fengUnits = Number((fengAllocatedUnits % spec).toFixed(4));
      
      // Stock & Remaining Calculation
      let shuangStockUnits = 0;
      let fengStockUnits = 0;
      
      let remainingShuangUnits = 0;
      let remainingFengUnits = 0;

      if (invItem) {
        const costPerUnit = (invItem.costPriceUnit && invItem.costPriceUnit > 0) 
            ? invItem.costPriceUnit : (invItem.costPriceBox / invItem.spec);
        
        const wholesalePerUnit = (invItem.wholesalePriceUnit && invItem.wholesalePriceUnit > 0)
            ? invItem.wholesalePriceUnit : (invItem.wholesalePriceBox / invItem.spec);
            
        let retailPerUnit = 0;
        if (invItem.retailPriceUnit && invItem.retailPriceUnit > 0) {
            retailPerUnit = invItem.retailPriceUnit;
        } else if (invItem.retailPriceBox && invItem.retailPriceBox > 0) {
            retailPerUnit = invItem.retailPriceBox / invItem.spec;
        } else {
            retailPerUnit = wholesalePerUnit;
        }
        
        costTotal = totalNeededUnits * costPerUnit;
        wholesaleTotal = totalNeededUnits * wholesalePerUnit;
        retailTotal = totalNeededUnits * retailPerUnit;

        // Stock Checks
        shuangStockUnits = (invItem.stockShuangBoxes * spec) + invItem.stockShuangUnits;
        fengStockUnits = (invItem.stockFengBoxes * spec) + invItem.stockFengUnits;
        
        remainingShuangUnits = shuangStockUnits - shuangAllocatedUnits;
        remainingFengUnits = fengStockUnits - fengAllocatedUnits;

        const shuangError = remainingShuangUnits < 0;
        const fengError = remainingFengUnits < 0;
        
        if (shuangError && fengError) {
             error = '两仓库存均不足';
             hasCriticalError = true;
        } else if (shuangError) {
             error = '爽仓库存不足';
             hasCriticalError = true;
        } else if (fengError) {
             error = '峰仓库存不足';
             hasCriticalError = true;
        } else if (fengAllocatedUnits < 0) {
             error = '分配错误: 爽仓分配超过总数';
             hasCriticalError = true;
        }

      } else {
          error = '商品不存在';
          hasCriticalError = true;
      }

      totalSale += pItem.soldPrice;
      totalCost += costTotal;
      totalWholesaleCost += wholesaleTotal;
      totalRetailValuation += retailTotal;

      // Convert Remaining to Box/Unit
      const remShuangB = Math.trunc(remainingShuangUnits / spec);
      const remShuangU = Number((remainingShuangUnits % spec).toFixed(4));
      const remFengB = Math.trunc(remainingFengUnits / spec);
      const remFengU = Number((remainingFengUnits % spec).toFixed(4));

      return {
        productName: pItem.productName,
        totalQtyBoxes: pItem.qtyBoxes,
        totalQtyUnits: pItem.qtyUnits,
        
        // Calculated Splits
        outShuangBoxes: pItem.assignedShuangBoxes || 0,
        outShuangUnits: pItem.assignedShuangUnits || 0,
        outFengBoxes: fengBoxes,
        outFengUnits: fengUnits,

        // Snapshot Remaining
        remShuangB, remShuangU,
        remFengB, remFengU,

        soldPrice: pItem.soldPrice,
        costTotal,
        wholesaleTotal,
        retailTotal,
        invId: invItem?.id,
        error
      };
    });

    const finalActualReceived = parseFloat(actualReceivedInput) || 0;
    
    // Profit Calcs
    const personalExtra = Math.max(0, finalActualReceived - totalRetailValuation);
    const wholesaleSurplus = (finalActualReceived - totalWholesaleCost) - personalExtra;
    const baseCostProfit = totalWholesaleCost - totalCost;

    const legacyCostProfit = finalActualReceived - totalCost;
    const legacyWholesaleProfit = finalActualReceived - totalWholesaleCost;

    return { 
        totalSale, 
        totalCost, 
        totalWholesaleCost, 
        totalRetailValuation,
        finalActualReceived,
        
        personalExtra,
        wholesaleSurplus,
        baseCostProfit,

        legacyCostProfit,
        legacyWholesaleProfit,

        finalItems, 
        hasCriticalError 
    };
  };

  const handleCommit = () => {
    const { 
        totalSale, 
        totalCost,
        totalWholesaleCost,
        finalActualReceived, 
        personalExtra,
        wholesaleSurplus,
        baseCostProfit,
        legacyCostProfit,
        legacyWholesaleProfit,
        finalItems, 
        hasCriticalError 
    } = calculateDetails();

    if (hasCriticalError) {
        alert("存在库存不足或商品错误，无法出库。请检查红色标记的条目。");
        return;
    }

    const record: OutboundRecord = {
      id: crypto.randomUUID(),
      date: parsedDate,
      person: parsedPerson,
      items: finalItems.map(item => ({
          invId: item.invId,
          productName: item.productName,
          qtyBoxes: item.totalQtyBoxes,
          qtyUnits: item.totalQtyUnits,
          soldPrice: item.soldPrice,
          
          outShuangBoxes: item.outShuangBoxes,
          outShuangUnits: item.outShuangUnits,
          outFengBoxes: item.outFengBoxes,
          outFengUnits: item.outFengUnits,
          
          remainingShuangBoxes: item.remShuangB,
          remainingShuangUnits: item.remShuangU,
          remainingFengBoxes: item.remFengB,
          remainingFengUnits: item.remFengU,

          costTotal: item.costTotal,
          wholesaleTotal: item.wholesaleTotal,
          retailTotal: item.retailTotal
      })),
      totalSale: totalSale,
      actualReceived: finalActualReceived,
      
      totalCostValue: totalCost,
      totalWholesaleValue: totalWholesaleCost,

      totalBaseProfit: baseCostProfit,
      totalWholesaleSurplus: wholesaleSurplus,
      totalPersonalExtra: personalExtra,

      totalCostProfit: legacyCostProfit,
      totalWholesaleProfit: legacyWholesaleProfit,
      
      rawText: inputText
    };
    
    onCommit(record);
    setInputText('');
    setPreviewMode(false);
    setParsedItems([]);
    setActualReceivedInput('');
    setShowAiRecommendation(false);
  };

  if (previewMode) {
    const { 
        totalSale, 
        totalCost,
        totalWholesaleCost,
        finalActualReceived,
        personalExtra,
        wholesaleSurplus,
        baseCostProfit,
        hasCriticalError, 
        finalItems 
    } = calculateDetails();

    const isAmountChanged = Math.abs(finalActualReceived - totalSale) > 0.01;

    return (
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 p-6 relative">
         <button 
           onClick={() => setShowConfig(true)}
           className="absolute top-4 right-4 p-2 text-gray-400 hover:text-indigo-600 rounded-full hover:bg-indigo-50"
         >
            <Settings size={20} />
         </button>

        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
               出库分配 <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">{parsedDate}</span>
            </h2>
            <div className="flex items-center gap-3 text-gray-500 mt-1">
                <span>客户: <span className="font-semibold text-gray-900">{parsedPerson}</span></span>
                <span className="text-xs text-gray-400">(默认分配给峰仓，请手动分配爽仓数量)</span>
            </div>
          </div>
          <button onClick={() => setPreviewMode(false)} className="text-sm text-gray-500 hover:text-gray-800 underline mr-8">
            修改文本
          </button>
        </div>

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="p-2 w-[20%]">商品 (匹配)</th>
                <th className="p-2 w-[15%] text-center bg-gray-100/50">总销量</th>
                <th className="p-2 w-[25%] text-center bg-orange-50 border-x border-orange-100 text-orange-800">
                    <div className="flex items-center justify-center gap-1">爽仓出货 (调整)</div>
                </th>
                <th className="p-2 w-[20%] text-center bg-blue-50 text-blue-800">
                    <div className="flex items-center justify-center gap-1">峰仓出货 (自动)</div>
                </th>
                <th className="p-2 w-[20%] text-right">财务小计</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {finalItems.map((item, idx) => {
                const invItem = inventory.find(i => i.id === item.invId);
                
                return (
                  <tr key={idx} className={item.error ? "bg-red-50" : ""}>
                    {/* Product Name & Status */}
                    <td className="p-2">
                        <div className="font-medium">{item.productName}</div>
                        {item.error ? (
                             <div className="text-xs text-red-500 flex items-center gap-1 font-bold mt-1"><AlertTriangle size={12}/> {item.error}</div>
                        ) : (
                             <div className="text-xs text-green-600 flex items-center gap-1 mt-1"><CheckCircle size={12}/> {invItem?.name}</div>
                        )}
                    </td>

                    {/* Total Quantity (ReadOnly) */}
                    <td className="p-2 text-center font-bold text-gray-700 bg-gray-50/30">
                       {item.totalQtyBoxes > 0 && `${item.totalQtyBoxes}箱 `}
                       {item.totalQtyUnits > 0 && `${item.totalQtyUnits}个`}
                    </td>

                    {/* Shuang Allocation (Editable) */}
                    <td className="p-2 bg-orange-50 border-x border-orange-100">
                         <div className="flex justify-center items-center gap-1">
                             <div className="relative">
                                <input 
                                    type="number" 
                                    className="w-12 p-1 text-right border border-orange-200 rounded text-sm focus:ring-1 focus:ring-orange-400 outline-none"
                                    value={item.outShuangBoxes}
                                    onChange={(e) => updateShuangAllocation(idx, 'assignedShuangBoxes', Number(e.target.value))}
                                />
                                <span className="absolute -right-0.5 top-0.5 text-[10px] text-gray-400 pointer-events-none opacity-0">箱</span>
                             </div>
                             <span className="text-xs text-gray-500">箱</span>
                             <div className="relative">
                                <input 
                                    type="number" 
                                    className="w-10 p-1 text-right border border-orange-200 rounded text-sm focus:ring-1 focus:ring-orange-400 outline-none"
                                    value={item.outShuangUnits}
                                    onChange={(e) => updateShuangAllocation(idx, 'assignedShuangUnits', Number(e.target.value))}
                                />
                             </div>
                             <span className="text-xs text-gray-500">个</span>
                         </div>
                         <div className="text-[10px] text-center text-orange-400 mt-1">
                             余: {item.remShuangB}箱{item.remShuangU}个
                         </div>
                    </td>

                    {/* Feng Allocation (Calculated) */}
                    <td className="p-2 bg-blue-50 text-center">
                        <div className="font-bold text-blue-800">
                             {item.outFengBoxes} <span className="text-xs font-normal text-blue-600">箱</span> {item.outFengUnits} <span className="text-xs font-normal text-blue-600">个</span>
                        </div>
                        <div className="text-[10px] text-center text-blue-400 mt-1">
                             余: {item.remFengB}箱{item.remFengU}个
                         </div>
                    </td>

                    {/* Financials */}
                    <td className="p-2 text-right">
                       <div className="font-mono text-gray-600">¥{item.soldPrice.toLocaleString()}</div>
                       <div className="flex flex-col text-[10px] text-gray-400 mt-1">
                           <span className="flex justify-end gap-1">成本 <span className="text-gray-600">¥{item.costTotal.toFixed(0)}</span></span>
                           <span className="flex justify-end gap-1">批发 <span className="text-blue-400">¥{item.wholesaleTotal.toFixed(0)}</span></span>
                       </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className={`p-4 rounded border text-center relative transition-colors ${isAmountChanged ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="text-xs text-gray-500 uppercase flex items-center justify-center gap-1 mb-1">
                    实收金额 <Edit3 size={12}/>
                </div>
                <div className="flex items-center justify-center">
                    <span className="text-2xl font-bold text-gray-900 mr-1">¥</span>
                    <input 
                        type="number" 
                        value={actualReceivedInput}
                        onChange={(e) => setActualReceivedInput(e.target.value)}
                        className={`text-2xl font-bold bg-transparent border-b border-gray-300 focus:border-indigo-600 focus:outline-none w-32 text-center ${isAmountChanged ? 'text-indigo-700' : 'text-gray-900'}`}
                    />
                </div>
                 <div className="flex justify-center gap-3 mt-2 text-[10px] text-gray-500">
                    <span title="本次总成本">总成本: ¥{totalCost.toFixed(0)}</span>
                    <span title="本次总批发">总批发: ¥{totalWholesaleCost.toFixed(0)}</span>
                 </div>
            </div>
            
            <div className="p-4 bg-green-50 rounded border border-green-100 text-center flex flex-col justify-center">
                <div className="text-xs text-green-600 uppercase mb-1 flex items-center justify-center gap-1">
                    <TrendingUp size={14}/> 成本利润
                </div>
                <div className="text-2xl font-bold text-green-700">¥{baseCostProfit.toLocaleString()}</div>
                <div className="text-[10px] text-green-600/60 mt-1">
                    批发总价 - 成本总价
                </div>
            </div>

             <div className="p-4 bg-blue-50 rounded border border-blue-100 text-center flex flex-col justify-center">
                <div className="text-xs text-blue-600 uppercase mb-1 flex items-center justify-center gap-1">
                    <Wallet size={14}/> 批发收益
                </div>
                <div className="text-2xl font-bold text-blue-700">¥{wholesaleSurplus.toLocaleString()}</div>
                 <div className="text-[10px] text-blue-600/60 mt-1">
                    (实收-批发) - 个人额外
                </div>
            </div>

            <div className="p-4 bg-orange-50 rounded border border-orange-100 text-center flex flex-col justify-center">
                <div className="text-xs text-orange-600 uppercase mb-1 flex items-center justify-center gap-1">
                    <User size={14}/> 个人额外收入
                </div>
                <div className="text-2xl font-bold text-orange-700">¥{personalExtra.toLocaleString()}</div>
                 <div className="text-[10px] text-orange-600/60 mt-1">
                    超出零售价的部分
                </div>
            </div>
        </div>
        
        {hasCriticalError && (
             <div className="mb-4 p-3 bg-red-100 text-red-700 text-sm rounded flex items-center gap-2 font-bold animate-pulse">
                 <AlertTriangle size={16}/> 注意：存在库存不足的情况，无法执行出库！请调整数量或补充库存。
             </div>
        )}

        <button 
          onClick={handleCommit}
          disabled={hasCriticalError}
          className={`w-full py-3 text-white font-bold rounded shadow-md flex justify-center items-center gap-2 transition-all ${hasCriticalError ? 'bg-gray-400 cursor-not-allowed opacity-70' : 'bg-indigo-600 hover:bg-indigo-700'}`}
        >
          <Calculator size={20} /> {hasCriticalError ? '库存不足，无法出库' : '确认出库并更新库存'}
        </button>
        
        {showConfig && (
            <div className="absolute inset-0 bg-white/95 z-10 flex flex-col items-center justify-center p-6 rounded-lg backdrop-blur-sm">
                <h3 className="text-lg font-bold mb-4">DeepSeek API Key</h3>
                <input 
                  type="password" 
                  className="w-full max-w-sm p-2 border rounded mb-4" 
                  placeholder="输入 sk-..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
                <div className="flex gap-2">
                    <button onClick={() => setShowConfig(false)} className="px-4 py-2 text-gray-600">取消</button>
                    <button onClick={saveApiKey} className="px-4 py-2 bg-indigo-600 text-white rounded">保存</button>
                </div>
            </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 h-full flex flex-col relative">
      <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-gray-800">出库文本解析</h2>
          <button 
             onClick={() => setShowConfig(true)}
             className="flex items-center gap-1 text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 rounded bg-gray-50 hover:bg-indigo-50"
           >
              <Settings size={14} /> 配置 Key
          </button>
      </div>
      <p className="text-sm text-gray-500 mb-4">请粘贴出库清单，解析后可手动分配“爽/峰”仓库的扣减数量。</p>
      
      <textarea
        className="flex-1 w-full p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm resize-none mb-4"
        placeholder={`📅 2026/1/1 (💁海哥)\n1. 迷你加特林: 1.5箱(￥198) = ￥264\n...`}
        value={inputText}
        onChange={(e) => {
            setInputText(e.target.value);
            if (showAiRecommendation) setShowAiRecommendation(false);
        }}
      />
      
      {showAiRecommendation && (
          <div className="mb-4 p-3 bg-indigo-50 text-indigo-800 text-sm rounded border border-indigo-100 flex items-center justify-between">
              <span className="flex items-center gap-2"><AlertCircle size={16}/> 正则未匹配到数据。格式可能复杂，建议使用 DeepSeek。</span>
              <ArrowRight className="animate-pulse" size={16}/>
          </div>
      )}

      <div className="flex gap-3">
        <button 
            onClick={() => parseTextRegex(inputText)}
            disabled={!inputText.trim()}
            className="flex-1 bg-gray-900 text-white py-2 px-4 rounded hover:bg-gray-800 transition disabled:opacity-50 flex justify-center items-center gap-2"
        >
            <ArrowRight size={18} /> 格式化解析 (正则)
        </button>
        <button 
            onClick={handleSmartParse}
            disabled={!inputText.trim() || isProcessingAI}
            className={`flex-1 text-white py-2 px-4 rounded transition disabled:opacity-50 flex justify-center items-center gap-2 ${showAiRecommendation ? 'bg-indigo-700 ring-2 ring-indigo-400 ring-offset-1' : 'bg-indigo-600 hover:bg-indigo-700'}`}
        >
            {isProcessingAI ? <RefreshCw className="animate-spin" size={18}/> : <BrainCircuit size={18}/>} 
            DeepSeek 智能解析
        </button>
      </div>

        {showConfig && (
            <div className="absolute inset-0 bg-white/95 z-20 flex flex-col items-center justify-center p-6 rounded-lg backdrop-blur-sm">
                <h3 className="text-lg font-bold mb-4">配置 DeepSeek API Key</h3>
                <p className="text-xs text-gray-500 mb-4 text-center max-w-xs">
                    系统直接调用 https://api.deepseek.com。Key 仅保存在您的本地浏览器中。
                </p>
                <input 
                  type="password" 
                  className="w-full max-w-sm p-2 border rounded mb-4" 
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
                <div className="flex gap-2">
                    <button onClick={() => setShowConfig(false)} className="px-4 py-2 text-gray-600">取消</button>
                    <button onClick={saveApiKey} className="px-4 py-2 bg-indigo-600 text-white rounded">保存</button>
                </div>
            </div>
        )}
    </div>
  );
};

export default OutboundProcessor;