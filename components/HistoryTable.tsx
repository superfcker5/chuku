import React, { useState } from 'react';
import { OutboundRecord, InventoryItem, ModificationLog } from '../types';
import { ChevronDown, ChevronUp, Coins, Wallet, Trash2, Edit2, X, Save, AlertTriangle, RotateCcw, History } from 'lucide-react';

interface Props {
  history: OutboundRecord[];
  inventory: InventoryItem[];
  onDelete: (id: string) => void;
  onUpdate: (record: OutboundRecord) => void;
}

const HistoryTable: React.FC<Props> = ({ history, inventory, onDelete, onUpdate }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Edit State
  const [editingRecord, setEditingRecord] = useState<OutboundRecord | null>(null);
  const [editReason, setEditReason] = useState('');

  // Return State
  const [returningRecord, setReturningRecord] = useState<OutboundRecord | null>(null);
  const [returnQuantities, setReturnQuantities] = useState<Record<number, {boxes: number, units: number}>>({});
  const [returnRefundAmount, setReturnRefundAmount] = useState(0);
  const [returnReason, setReturnReason] = useState('');

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatQty = (boxes: number, units: number) => {
    if (boxes === 0 && units === 0) return "-";
    const parts = [];
    if (boxes > 0) parts.push(`${boxes}箱`);
    if (units > 0) parts.push(`${units}个`);
    return parts.join('');
  };

  // --- EDIT HANDLERS ---
  const handleEditClick = (e: React.MouseEvent, record: OutboundRecord) => {
      e.stopPropagation();
      setEditingRecord(JSON.parse(JSON.stringify(record)));
      setEditReason('');
  };

  const updateEditItem = (index: number, field: string, value: number) => {
      if(!editingRecord) return;
      const newItems = [...editingRecord.items];
      newItems[index] = { ...newItems[index], [field]: value };
      setEditingRecord({ ...editingRecord, items: newItems });
  };

  const handleSaveEdit = () => {
      if(!editingRecord) return;
      
      // ... Recalculate logic (Same as before) ...
      let totalSale = 0;
      let totalCost = 0;
      let totalWholesale = 0;
      let totalRetail = 0;

      const updatedItems = editingRecord.items.map(item => {
           const invItem = inventory.find(i => i.id === item.invId);
           const spec = invItem ? invItem.spec : 1;
           const totalUnits = (item.qtyBoxes * spec) + item.qtyUnits;
           
           const shuangUnits = (item.outShuangBoxes * spec) + item.outShuangUnits;
           const fengUnits = Math.max(0, totalUnits - shuangUnits);
           
           const newFengBoxes = Math.trunc(fengUnits / spec);
           const newFengUnits = Number((fengUnits % spec).toFixed(4));
           
           let itemCost = item.costTotal;
           let itemWholesale = item.wholesaleTotal;
           let itemRetail = item.retailTotal;

           if (invItem) {
               const costU = invItem.costPriceUnit || (invItem.costPriceBox / spec);
               const wholeU = invItem.wholesalePriceUnit || (invItem.wholesalePriceBox / spec);
               const retailU = invItem.retailPriceUnit || (invItem.retailPriceBox / spec) || wholeU;
               
               itemCost = totalUnits * costU;
               itemWholesale = totalUnits * wholeU;
               itemRetail = totalUnits * retailU;
           }

           totalSale += item.soldPrice;
           totalCost += itemCost;
           totalWholesale += itemWholesale;
           totalRetail += itemRetail;

           return {
               ...item,
               outFengBoxes: newFengBoxes,
               outFengUnits: newFengUnits,
               costTotal: itemCost,
               wholesaleTotal: itemWholesale,
               retailTotal: itemRetail
           };
      });

      const actualReceived = editingRecord.actualReceived ?? totalSale;
      const personalExtra = Math.max(0, actualReceived - totalRetail);
      const wholesaleSurplus = (actualReceived - totalWholesale) - personalExtra;
      const baseProfit = totalWholesale - totalCost;

      // Add Log
      const newLog: ModificationLog = {
          date: new Date().toLocaleString(),
          action: 'EDIT',
          details: '用户手动修改了订单详情',
          note: editReason || '无备注'
      };

      const updatedRecord: OutboundRecord = {
          ...editingRecord,
          items: updatedItems,
          totalSale: totalSale,
          actualReceived: actualReceived,
          
          totalCostValue: totalCost,
          totalWholesaleValue: totalWholesale,
          
          totalBaseProfit: baseProfit,
          totalWholesaleSurplus: wholesaleSurplus,
          totalPersonalExtra: personalExtra,
          
          totalCostProfit: actualReceived - totalCost,
          totalWholesaleProfit: actualReceived - totalWholesale,
          
          historyLogs: [...(editingRecord.historyLogs || []), newLog]
      };

      onUpdate(updatedRecord);
      setEditingRecord(null);
  };

  // --- RETURN HANDLERS ---
  const handleReturnClick = (e: React.MouseEvent, record: OutboundRecord) => {
      e.stopPropagation();
      setReturningRecord(record);
      setReturnQuantities({});
      setReturnRefundAmount(0);
      setReturnReason('');
  };

  const updateReturnQty = (index: number, type: 'boxes' | 'units', value: number) => {
      const current = returnQuantities[index] || { boxes: 0, units: 0 };
      const updated = { ...current, [type]: value };
      const newQtys = { ...returnQuantities, [index]: updated };
      setReturnQuantities(newQtys);

      // Auto-calculate suggested refund
      if (returningRecord) {
          let suggestedRefund = 0;
          Object.entries(newQtys).forEach(([idx, qty]) => {
              const i = Number(idx);
              const item = returningRecord.items[i];
              const invItem = inventory.find(inv => inv.id === item.invId);
              const spec = invItem?.spec || 1;
              
              const itemTotalUnits = (item.qtyBoxes * spec) + item.qtyUnits;
              const returnTotalUnits = (qty.boxes * spec) + qty.units;
              
              if (itemTotalUnits > 0) {
                 const pricePerUnit = item.soldPrice / itemTotalUnits;
                 suggestedRefund += pricePerUnit * returnTotalUnits;
              }
          });
          setReturnRefundAmount(Math.floor(suggestedRefund));
      }
  };

  const handleConfirmReturn = () => {
      if (!returningRecord) return;
      
      // Validation
      let hasReturn = false;
      for (const [idx, qtyUnknown] of Object.entries(returnQuantities)) {
          const qty = qtyUnknown as { boxes: number, units: number };
          const item = returningRecord.items[Number(idx)];
          const invItem = inventory.find(inv => inv.id === item.invId);
          const spec = invItem?.spec || 1;
          
          const currentTotal = (item.qtyBoxes * spec) + item.qtyUnits;
          const returnTotal = (qty.boxes * spec) + qty.units;
          
          if (returnTotal > currentTotal) {
              alert(`商品 ${item.productName} 退货数量不能超过原订单数量！`);
              return;
          }
          if (returnTotal > 0) hasReturn = true;
      }

      if (!hasReturn) {
          alert("请至少输入一个商品的退货数量");
          return;
      }

      // Process Return: Create new record state
      const logDetails: string[] = [];
      const updatedItems = returningRecord.items.map((item, idx) => {
          const ret = returnQuantities[idx] as { boxes: number, units: number } | undefined;
          if (!ret || (ret.boxes === 0 && ret.units === 0)) return item;

          const invItem = inventory.find(i => i.id === item.invId);
          const spec = invItem?.spec || 1;

          const oldTotalUnits = (item.qtyBoxes * spec) + item.qtyUnits;
          const retTotalUnits = (ret.boxes * spec) + ret.units;
          const newTotalUnits = oldTotalUnits - retTotalUnits;

          const newBoxes = Math.trunc(newTotalUnits / spec);
          const newUnits = Number((newTotalUnits % spec).toFixed(4));
          
          // Adjust Warehouse Out (Reduce from Feng first, then Shuang)
          // Logic: We need to reduce 'outFeng' and 'outShuang' so that inventory increases back in App.tsx logic
          const oldOutFengUnits = (item.outFengBoxes * spec) + item.outFengUnits;
          const oldOutShuangUnits = (item.outShuangBoxes * spec) + item.outShuangUnits;

          let reduceFeng = 0;
          let reduceShuang = 0;

          if (oldOutFengUnits >= retTotalUnits) {
              reduceFeng = retTotalUnits;
          } else {
              reduceFeng = oldOutFengUnits;
              reduceShuang = retTotalUnits - oldOutFengUnits;
          }

          const newOutFengTotal = oldOutFengUnits - reduceFeng;
          const newOutShuangTotal = oldOutShuangUnits - reduceShuang;

          const newOutFengBoxes = Math.trunc(newOutFengTotal / spec);
          const newOutFengUnits = Number((newOutFengTotal % spec).toFixed(4));
          const newOutShuangBoxes = Math.trunc(newOutShuangTotal / spec);
          const newOutShuangUnits = Number((newOutShuangTotal % spec).toFixed(4));

          // Adjust Costs/Price
          const ratio = newTotalUnits / oldTotalUnits; // If 0 units left, ratio is 0
          
          logDetails.push(`${item.productName} 退 ${ret.boxes}箱${ret.units}个`);

          return {
              ...item,
              qtyBoxes: newBoxes,
              qtyUnits: newUnits,
              outFengBoxes: newOutFengBoxes,
              outFengUnits: newOutFengUnits,
              outShuangBoxes: newOutShuangBoxes,
              outShuangUnits: newOutShuangUnits,
              
              soldPrice: item.soldPrice * ratio,
              costTotal: item.costTotal * ratio,
              wholesaleTotal: item.wholesaleTotal * ratio,
              retailTotal: item.retailTotal * ratio
          };
      });

      // Recalculate Totals
      let newTotalSale = 0;
      let newTotalCost = 0;
      let newTotalWholesale = 0;
      let newTotalRetail = 0;

      updatedItems.forEach(item => {
          newTotalSale += item.soldPrice;
          newTotalCost += item.costTotal;
          newTotalWholesale += item.wholesaleTotal;
          newTotalRetail += item.retailTotal;
      });

      // Original Actual Received - Refund Amount
      const oldActual = returningRecord.actualReceived ?? returningRecord.totalSale;
      const newActualReceived = oldActual - returnRefundAmount;

      const personalExtra = Math.max(0, newActualReceived - newTotalRetail);
      const wholesaleSurplus = (newActualReceived - newTotalWholesale) - personalExtra;
      const baseProfit = newTotalWholesale - newTotalCost;

      const newLog: ModificationLog = {
          date: new Date().toLocaleString(),
          action: 'RETURN',
          details: logDetails.join(', '),
          note: `退款金额: ¥${returnRefundAmount}。${returnReason}`
      };

      const finalRecord: OutboundRecord = {
          ...returningRecord,
          items: updatedItems,
          totalSale: newTotalSale,
          actualReceived: newActualReceived,
          
          totalCostValue: newTotalCost,
          totalWholesaleValue: newTotalWholesale,
          totalBaseProfit: baseProfit,
          totalWholesaleSurplus: wholesaleSurplus,
          totalPersonalExtra: personalExtra,
          
          totalCostProfit: newActualReceived - newTotalCost,
          totalWholesaleProfit: newActualReceived - newTotalWholesale,

          historyLogs: [...(returningRecord.historyLogs || []), newLog]
      };

      onUpdate(finalRecord);
      setReturningRecord(null);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if(window.confirm("确定要删除此订单吗？删除后库存会自动退回。")) {
          onDelete(id);
      }
  };

  if (history.length === 0) {
    return <div className="text-center py-10 text-gray-400">暂无出库记录。</div>;
  }

  return (
    <>
    <div className="space-y-4">
      {history.map((record) => {
        const actualReceived = record.actualReceived ?? record.totalSale;
        const isModified = record.totalSale !== actualReceived;
        
        const displayTotalCost = record.totalCostValue || record.items.reduce((sum, item) => sum + (item.costTotal || 0), 0);
        const displayTotalWholesale = record.totalWholesaleValue || record.items.reduce((sum, item) => sum + (item.wholesaleTotal || 0), 0);

        const baseProfit = record.totalBaseProfit ?? record.totalCostProfit;
        const wholesaleSurplus = record.totalWholesaleSurplus ?? record.totalWholesaleProfit;
        
        const hasLogs = record.historyLogs && record.historyLogs.length > 0;

        return (
        <div key={record.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm group">
          <div 
            onClick={() => toggleExpand(record.id)}
            className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition gap-4"
          >
            <div className="flex gap-4 items-center">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0 relative">
                {record.person.charAt(0)}
                {hasLogs && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    {record.person}
                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-normal hidden sm:inline-block">
                        {record.items.length}品
                    </span>
                    {hasLogs && <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-normal flex items-center gap-1"><History size={10}/> 有修改</span>}
                </h3>
                <p className="text-xs text-gray-500">{record.date}</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-6 text-sm flex-1">
              
              <div className="text-right hidden md:block">
                <div className="text-gray-400 text-[10px] flex justify-end items-center gap-1"><Coins size={10}/> 总成本</div>
                <div className="font-medium text-gray-600">¥{displayTotalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>

              <div className="text-right hidden md:block">
                <div className="text-gray-400 text-[10px] flex justify-end items-center gap-1"><Wallet size={10}/> 总批发</div>
                <div className="font-medium text-gray-600">¥{displayTotalWholesale.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>

              <div className="text-right">
                <div className="text-gray-500 text-[10px]">实收</div>
                <div className={`font-bold ${isModified ? 'text-indigo-700' : 'text-gray-900'}`}>
                    ¥{actualReceived.toLocaleString()}
                </div>
              </div>

              <div className="text-right">
                <div className="text-gray-500 text-[10px]">成本利</div>
                <div className="font-bold text-green-600">¥{baseProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              
              <div className="text-right">
                <div className="text-gray-500 text-[10px]">批发益</div>
                <div className="font-bold text-blue-600">¥{wholesaleSurplus.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>

              <div className="flex items-center gap-1">
                 {expandedId === record.id ? <ChevronUp size={20} className="text-gray-400"/> : <ChevronDown size={20} className="text-gray-400"/>}
              </div>
            </div>
          </div>

          {expandedId === record.id && (
            <div className="bg-gray-50 border-t border-gray-100 p-4 relative">
               <div className="absolute top-4 right-4 flex gap-2">
                   <button 
                     onClick={(e) => handleReturnClick(e, record)}
                     className="flex items-center gap-1 px-3 py-1.5 bg-yellow-50 text-yellow-700 text-xs rounded hover:bg-yellow-100 border border-yellow-200"
                   >
                       <RotateCcw size={12}/> 申请退货
                   </button>
                   <button 
                     onClick={(e) => handleEditClick(e, record)}
                     className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 text-xs rounded hover:bg-indigo-100 border border-indigo-200"
                   >
                       <Edit2 size={12}/> 修改纠错
                   </button>
                   <button 
                     onClick={(e) => handleDeleteClick(e, record.id)}
                     className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-700 text-xs rounded hover:bg-red-100 border border-red-200"
                   >
                       <Trash2 size={12}/> 删除
                   </button>
               </div>

               <div className="flex md:hidden flex-wrap gap-4 mb-4 text-xs text-gray-600 bg-white p-2 rounded border border-gray-100 max-w-[80%]">
                   <span><strong>总成本:</strong> ¥{displayTotalCost.toLocaleString()}</span>
                   <span><strong>总批发:</strong> ¥{displayTotalWholesale.toLocaleString()}</span>
               </div>
               
               <div className="overflow-x-auto mt-2">
                <table className="w-full text-xs text-left mb-4 min-w-[600px]">
                    <thead className="text-gray-500 font-medium border-b border-gray-200">
                        <tr>
                        <th className="py-2">商品</th>
                        <th className="py-2 text-center">总数量</th>
                        <th className="py-2 text-center bg-orange-50/50">爽仓出(余)</th>
                        <th className="py-2 text-center bg-blue-50/50">峰仓出(余)</th>
                        <th className="py-2 text-right">标价</th>
                        </tr>
                    </thead>
                    <tbody>
                        {record.items.map((item, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 font-medium">{item.productName}</td>
                            <td className="py-2 text-center text-gray-600">
                                {formatQty(item.qtyBoxes, item.qtyUnits)}
                            </td>
                            <td className="py-2 text-center text-orange-600 bg-orange-50/30">
                                <div>{item.outShuangBoxes !== undefined ? formatQty(item.outShuangBoxes, item.outShuangUnits) : (record.warehouse === '爽' ? formatQty(item.qtyBoxes, item.qtyUnits) : '-')}</div>
                                {(item.remainingShuangBoxes !== undefined) && (
                                    <div className="text-[10px] text-gray-400 mt-0.5">余: {formatQty(item.remainingShuangBoxes, item.remainingShuangUnits)}</div>
                                )}
                            </td>
                            <td className="py-2 text-center text-blue-600 bg-blue-50/30">
                                <div>{item.outFengBoxes !== undefined ? formatQty(item.outFengBoxes, item.outFengUnits) : (record.warehouse === '峰' || !record.warehouse ? formatQty(item.qtyBoxes, item.qtyUnits) : '-')}</div>
                                {(item.remainingFengBoxes !== undefined) && (
                                    <div className="text-[10px] text-gray-400 mt-0.5">余: {formatQty(item.remainingFengBoxes, item.remainingFengUnits)}</div>
                                )}
                            </td>
                            <td className="py-2 text-right">
                                <div>¥{item.soldPrice}</div>
                                <div className="text-[10px] text-gray-400 flex flex-col items-end">
                                    <span>批:¥{item.wholesaleTotal?.toFixed(0)}</span>
                                    <span className="text-gray-300">本:¥{item.costTotal?.toFixed(0)}</span>
                                </div>
                            </td>
                        </tr>
                        ))}
                    </tbody>
                </table>
               </div>
               
               {/* Log Display */}
               {hasLogs && (
                   <div className="mt-4 p-3 bg-white border border-gray-200 rounded text-xs">
                       <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-1"><History size={12}/> 操作记录</h4>
                       <ul className="space-y-2">
                           {record.historyLogs?.map((log, idx) => (
                               <li key={idx} className="flex gap-2 text-gray-600">
                                   <span className="text-gray-400 shrink-0 font-mono">[{log.date}]</span>
                                   <span className={`font-bold px-1 rounded ${log.action === 'RETURN' ? 'bg-yellow-100 text-yellow-800' : (log.action === 'EDIT' ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100')}`}>
                                       {log.action === 'RETURN' ? '退货' : (log.action === 'EDIT' ? '修改' : '创建')}
                                   </span>
                                   <span>{log.details}</span>
                                   {log.note && <span className="text-gray-400 italic">- {log.note}</span>}
                               </li>
                           ))}
                       </ul>
                   </div>
               )}
            </div>
          )}
        </div>
        );
      })}
    </div>

    {/* EDIT MODAL (CORRECTION) */}
    {editingRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-lg shadow-xl flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-lg">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Edit2 size={16}/> 修改订单 (纠错模式)
                    </h3>
                    <button onClick={() => setEditingRecord(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={20}/>
                    </button>
                </div>
                
                <div className="p-4 overflow-y-auto flex-1">
                    <div className="mb-4 bg-blue-50 p-3 rounded text-sm text-blue-800 flex items-start gap-2">
                         <AlertTriangle size={16} className="mt-0.5 shrink-0"/>
                         <p>
                             这是<strong>纠错模式</strong>，用于修正录入错误（如输错价格、数量）。<br/>
                             如果您需要处理客户退货，请取消并在列表点击黄色“申请退货”按钮。
                         </p>
                    </div>

                    <table className="w-full text-sm">
                        <thead className="bg-gray-100 text-gray-600">
                            <tr>
                                <th className="p-2 text-left">商品</th>
                                <th className="p-2 text-center">总数量 (箱/个)</th>
                                <th className="p-2 text-center bg-orange-50 text-orange-800">分配给爽仓</th>
                                <th className="p-2 text-center bg-blue-50 text-blue-800">分配给峰仓 (自动)</th>
                                <th className="p-2 text-right">本行售价 (¥)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {editingRecord.items.map((item, idx) => {
                                const invItem = inventory.find(i => i.id === item.invId);
                                const spec = invItem?.spec || 1;
                                const totalUnits = (item.qtyBoxes * spec) + item.qtyUnits;
                                const shuangUnits = (item.outShuangBoxes * spec) + item.outShuangUnits;
                                const fengUnits = Math.max(0, totalUnits - shuangUnits);
                                const fengBoxes = Math.trunc(fengUnits / spec);
                                const fUnits = Number((fengUnits % spec).toFixed(4));

                                return (
                                <tr key={idx}>
                                    <td className="p-2 font-medium">
                                        {item.productName}
                                        <div className="text-[10px] text-gray-400">1箱={spec}个</div>
                                    </td>
                                    <td className="p-2">
                                        <div className="flex justify-center gap-1">
                                            <input 
                                                type="number" className="w-14 p-1 border rounded text-right"
                                                value={item.qtyBoxes}
                                                onChange={e => updateEditItem(idx, 'qtyBoxes', Number(e.target.value))}
                                            />
                                            <span className="text-gray-400 py-1">箱</span>
                                            <input 
                                                type="number" className="w-12 p-1 border rounded text-right"
                                                value={item.qtyUnits}
                                                onChange={e => updateEditItem(idx, 'qtyUnits', Number(e.target.value))}
                                            />
                                            <span className="text-gray-400 py-1">个</span>
                                        </div>
                                    </td>
                                    <td className="p-2 bg-orange-50/30">
                                         <div className="flex justify-center gap-1">
                                            <input 
                                                type="number" className="w-14 p-1 border border-orange-200 rounded text-right"
                                                value={item.outShuangBoxes}
                                                onChange={e => updateEditItem(idx, 'outShuangBoxes', Number(e.target.value))}
                                            />
                                            <span className="text-gray-400 py-1">箱</span>
                                            <input 
                                                type="number" className="w-12 p-1 border border-orange-200 rounded text-right"
                                                value={item.outShuangUnits}
                                                onChange={e => updateEditItem(idx, 'outShuangUnits', Number(e.target.value))}
                                            />
                                            <span className="text-gray-400 py-1">个</span>
                                        </div>
                                    </td>
                                    <td className="p-2 bg-blue-50/30 text-center text-blue-800 font-mono">
                                        {fengBoxes}箱 {fUnits}个
                                    </td>
                                    <td className="p-2 text-right">
                                        <input 
                                            type="number" className="w-20 p-1 border rounded text-right font-bold"
                                            value={item.soldPrice}
                                            onChange={e => updateEditItem(idx, 'soldPrice', Number(e.target.value))}
                                        />
                                    </td>
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="mt-4 p-4 bg-gray-50 rounded">
                        <div className="flex justify-between items-center mb-2">
                            <label className="text-xs text-gray-500">修改备注 (选填)</label>
                            <div className="flex items-center gap-1">
                                <span className="font-bold text-gray-500 text-sm">实收总额: ¥</span>
                                <input 
                                    type="number" 
                                    className="w-32 p-1 bg-white border border-gray-300 rounded text-right font-bold focus:outline-none focus:border-indigo-500"
                                    value={editingRecord.actualReceived ?? editingRecord.totalSale}
                                    onChange={(e) => setEditingRecord({...editingRecord, actualReceived: Number(e.target.value)})}
                                />
                            </div>
                        </div>
                        <input 
                            type="text" 
                            className="w-full p-2 border rounded text-sm" 
                            placeholder="例如：录入时价格输错了"
                            value={editReason}
                            onChange={e => setEditReason(e.target.value)}
                        />
                    </div>
                </div>

                <div className="p-4 border-t flex justify-end gap-3 bg-gray-50 rounded-b-lg">
                    <button onClick={() => setEditingRecord(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded">取消</button>
                    <button onClick={handleSaveEdit} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 flex items-center gap-2">
                        <Save size={18}/> 保存修正
                    </button>
                </div>
            </div>
        </div>
    )}

    {/* RETURN MODAL */}
    {returningRecord && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-2xl rounded-lg shadow-xl flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-yellow-50 rounded-t-lg">
                    <h3 className="font-bold text-yellow-800 flex items-center gap-2">
                        <RotateCcw size={16}/> 申请退货
                    </h3>
                    <button onClick={() => setReturningRecord(null)} className="text-gray-400 hover:text-gray-600">
                        <X size={20}/>
                    </button>
                </div>

                <div className="p-6">
                    <p className="text-sm text-gray-500 mb-4">请填写客户退回的商品数量，系统将自动计算退款金额并恢复库存。</p>
                    
                    <div className="max-h-[50vh] overflow-y-auto mb-4 border rounded">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-100 text-gray-600">
                                <tr>
                                    <th className="p-2 text-left">商品</th>
                                    <th className="p-2 text-center">原购数量</th>
                                    <th className="p-2 text-center bg-yellow-50">退货数量</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {returningRecord.items.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="p-2 font-medium">{item.productName}</td>
                                        <td className="p-2 text-center text-gray-500">
                                            {formatQty(item.qtyBoxes, item.qtyUnits)}
                                        </td>
                                        <td className="p-2 bg-yellow-50/30">
                                            <div className="flex justify-center gap-1 items-center">
                                                <input 
                                                    type="number" className="w-14 p-1 border border-yellow-300 rounded text-right focus:ring-yellow-500"
                                                    placeholder="0"
                                                    value={returnQuantities[idx]?.boxes || ''}
                                                    onChange={e => updateReturnQty(idx, 'boxes', Number(e.target.value))}
                                                />
                                                <span className="text-gray-400 text-xs">箱</span>
                                                <input 
                                                    type="number" className="w-12 p-1 border border-yellow-300 rounded text-right focus:ring-yellow-500"
                                                    placeholder="0"
                                                    value={returnQuantities[idx]?.units || ''}
                                                    onChange={e => updateReturnQty(idx, 'units', Number(e.target.value))}
                                                />
                                                <span className="text-gray-400 text-xs">个</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center bg-gray-50 p-3 rounded">
                            <span className="font-bold text-gray-700">应退款金额</span>
                            <div className="flex items-center gap-1">
                                <span className="text-lg font-bold text-red-600">- ¥</span>
                                <input 
                                    type="number" 
                                    className="w-24 p-1 text-lg font-bold text-red-600 bg-white border rounded text-right"
                                    value={returnRefundAmount}
                                    onChange={e => setReturnRefundAmount(Number(e.target.value))}
                                />
                            </div>
                        </div>
                        <div>
                             <label className="text-xs text-gray-500 block mb-1">退货备注</label>
                             <input 
                                type="text" className="w-full p-2 border rounded text-sm"
                                placeholder="例如：商品滞销退回"
                                value={returnReason}
                                onChange={e => setReturnReason(e.target.value)}
                             />
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t flex justify-end gap-3 bg-gray-50 rounded-b-lg">
                    <button onClick={() => setReturningRecord(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded">取消</button>
                    <button onClick={handleConfirmReturn} className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 flex items-center gap-2 shadow-sm">
                        <RotateCcw size={18}/> 确认退货
                    </button>
                </div>
            </div>
        </div>
    )}
    </>
  );
};

export default HistoryTable;