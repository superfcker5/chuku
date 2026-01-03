import React from 'react';
import { OutboundRecord } from '../types';
import { ChevronDown, ChevronUp, Coins, Wallet } from 'lucide-react';

interface Props {
  history: OutboundRecord[];
}

const HistoryTable: React.FC<Props> = ({ history }) => {
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

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

  if (history.length === 0) {
    return <div className="text-center py-10 text-gray-400">暂无出库记录。</div>;
  }

  return (
    <div className="space-y-4">
      {history.map((record) => {
        // Fallback for old records that don't have actualReceived field
        const actualReceived = record.actualReceived ?? record.totalSale;
        const isModified = record.totalSale !== actualReceived;

        // Fallback calculations for legacy records missing totalCostValue/totalWholesaleValue
        const displayTotalCost = record.totalCostValue || record.items.reduce((sum, item) => sum + (item.costTotal || 0), 0);
        const displayTotalWholesale = record.totalWholesaleValue || record.items.reduce((sum, item) => sum + (item.wholesaleTotal || 0), 0);

        const baseProfit = record.totalBaseProfit ?? record.totalCostProfit;
        const wholesaleSurplus = record.totalWholesaleSurplus ?? record.totalWholesaleProfit;

        return (
        <div key={record.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <div 
            onClick={() => toggleExpand(record.id)}
            className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition gap-4"
          >
            <div className="flex gap-4 items-center">
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs shrink-0">
                {record.person.charAt(0)}
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">{record.person}</h3>
                <p className="text-xs text-gray-500">{record.date}</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-6 text-sm flex-1">
              
              {/* Cost - Hidden on very small screens, shown on tablet+ */}
              <div className="text-right hidden md:block">
                <div className="text-gray-400 text-[10px] flex justify-end items-center gap-1"><Coins size={10}/> 总成本</div>
                <div className="font-medium text-gray-600">¥{displayTotalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>

               {/* Wholesale - Hidden on very small screens, shown on tablet+ */}
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

              {expandedId === record.id ? <ChevronUp size={20} className="text-gray-400"/> : <ChevronDown size={20} className="text-gray-400"/>}
            </div>
          </div>

          {expandedId === record.id && (
            <div className="bg-gray-50 border-t border-gray-100 p-4">
               {/* Mobile view details for Cost/Wholesale since they are hidden in row */}
               <div className="flex md:hidden flex-wrap gap-4 mb-4 text-xs text-gray-600 bg-white p-2 rounded border border-gray-100">
                   <span><strong>总成本:</strong> ¥{displayTotalCost.toLocaleString()}</span>
                   <span><strong>总批发:</strong> ¥{displayTotalWholesale.toLocaleString()}</span>
               </div>
               
               <div className="overflow-x-auto">
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
               <div className="text-xs text-gray-400 font-mono bg-gray-100 p-2 rounded">
                 {record.rawText.split('\n')[0]}...
               </div>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
};

export default HistoryTable;