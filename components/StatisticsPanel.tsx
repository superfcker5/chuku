import React, { useState, useMemo } from 'react';
import { InventoryItem, OutboundRecord } from '../types';
import HistoryTable from './HistoryTable';
import { exportHistoryToCSV, exportHistorySummaryToCSV } from '../services/storageService';
import { Search, Download, Users, List, BarChart3, TrendingUp, Wallet, User, CheckSquare, Square, Coins, ChevronDown } from 'lucide-react';

interface Props {
  history: OutboundRecord[];
  inventory: InventoryItem[];
  onDelete: (record: OutboundRecord) => void;
  onUpdate: (record: OutboundRecord) => void;
}

type ViewMode = 'overview' | 'person_rank' | 'product_matrix';

const StatisticsPanel: React.FC<Props> = ({ history, inventory, onDelete, onUpdate }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  
  // Filters
  const [selectedPersons, setSelectedPersons] = useState<string[]>([]);
  const [isPersonDropdownOpen, setIsPersonDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Extract all unique persons for the filter list
  const allPersons = useMemo(() => {
    const persons = new Set(history.map(r => r.person));
    return Array.from(persons).sort();
  }, [history]);

  const togglePersonSelection = (person: string) => {
    if (selectedPersons.includes(person)) {
      setSelectedPersons(selectedPersons.filter(p => p !== person));
    } else {
      setSelectedPersons([...selectedPersons, person]);
    }
  };

  const clearPersonFilter = () => setSelectedPersons([]);

  // 1. Base Filter Logic
  const filteredHistory = useMemo(() => {
    return history.filter(record => {
      // Filter by Person (Multi-select)
      if (selectedPersons.length > 0 && !selectedPersons.includes(record.person)) {
          return false;
      }
      
      // Filter by Date
      if (filterStartDate || filterEndDate) {
        const recordDate = new Date(record.date).getTime();
        if (isNaN(recordDate)) return true;

        if (filterStartDate) {
           const start = new Date(filterStartDate).getTime();
           if (recordDate < start) return false;
        }
        if (filterEndDate) {
           const end = new Date(filterEndDate).getTime();
           if (recordDate > end) return false;
        }
      }
      return true;
    });
  }, [history, selectedPersons, filterStartDate, filterEndDate]);

  // 2. Global Stats Calculation (Updated for new Logic)
  const globalStats = useMemo(() => {
    return filteredHistory.reduce((acc, curr) => {
        const received = curr.actualReceived ?? curr.totalSale;
        const rCost = curr.totalCostValue || curr.items.reduce((s, i) => s + (i.costTotal||0), 0);
        const rWholesale = curr.totalWholesaleValue || curr.items.reduce((s, i) => s + (i.wholesaleTotal||0), 0);

        return {
            sales: acc.sales + received,
            baseCostProfit: acc.baseCostProfit + (curr.totalBaseProfit ?? curr.totalCostProfit ?? 0),
            wholesaleSurplus: acc.wholesaleSurplus + (curr.totalWholesaleSurplus ?? curr.totalWholesaleProfit ?? 0),
            personalExtra: acc.personalExtra + (curr.totalPersonalExtra || 0),
            totalCost: acc.totalCost + rCost,
            totalWholesale: acc.totalWholesale + rWholesale
        };
    }, { sales: 0, baseCostProfit: 0, wholesaleSurplus: 0, personalExtra: 0, totalCost: 0, totalWholesale: 0 });
  }, [filteredHistory]);

  // 3. Person Summary Calculation
  const personStats = useMemo(() => {
    const stats: Record<string, { 
        name: string, 
        count: number, 
        sales: number, 
        baseProfit: number, 
        wholesaleSurplus: number,
        personalExtra: number,
        totalCost: number,
        totalWholesale: number
    }> = {};
    
    filteredHistory.forEach(record => {
        const p = record.person;
        const received = record.actualReceived ?? record.totalSale;
        const rCost = record.totalCostValue || record.items.reduce((s, i) => s + (i.costTotal||0), 0);
        const rWholesale = record.totalWholesaleValue || record.items.reduce((s, i) => s + (i.wholesaleTotal||0), 0);
        
        if (!stats[p]) {
            stats[p] = { name: p, count: 0, sales: 0, baseProfit: 0, wholesaleSurplus: 0, personalExtra: 0, totalCost: 0, totalWholesale: 0 };
        }
        stats[p].count += 1;
        stats[p].sales += received;
        stats[p].baseProfit += (record.totalBaseProfit ?? record.totalCostProfit ?? 0);
        stats[p].wholesaleSurplus += (record.totalWholesaleSurplus ?? record.totalWholesaleProfit ?? 0);
        stats[p].personalExtra += (record.totalPersonalExtra || 0);
        stats[p].totalCost += rCost;
        stats[p].totalWholesale += rWholesale;
    });

    return Object.values(stats).sort((a, b) => b.sales - a.sales);
  }, [filteredHistory]);

  // 4. Product-Person Matrix Calculation
  const productMatrix = useMemo(() => {
    // Map<ProductName, Map<PersonName, { boxes: number, units: number }>>
    const matrix = new Map<string, Map<string, { boxes: number, units: number }>>();
    const personsInView = new Set<string>();
    
    // Aggregate data
    filteredHistory.forEach(record => {
        const p = record.person;
        personsInView.add(p);
        
        record.items.forEach(item => {
            if (!matrix.has(item.productName)) {
                matrix.set(item.productName, new Map());
            }
            const productRow = matrix.get(item.productName)!;
            
            if (!productRow.has(p)) {
                productRow.set(p, { boxes: 0, units: 0 });
            }
            const cell = productRow.get(p)!;
            cell.boxes += item.qtyBoxes;
            cell.units += item.qtyUnits;
        });
    });

    // Convert to array for rendering
    const sortedPersons = Array.from(personsInView).sort(); 
    const rows = Array.from(matrix.entries()).map(([productName, personMap]) => {
        let totalBoxes = 0; 
        let totalUnits = 0;
        
        const rowData: any = { productName };
        sortedPersons.forEach(p => {
            const val = personMap.get(p);
            if (val) {
                rowData[p] = val;
                totalBoxes += val.boxes;
                totalUnits += val.units;
            } else {
                rowData[p] = null;
            }
        });
        
        return { ...rowData, _totalBoxes: totalBoxes, _totalUnits: totalUnits };
    });

    // Sort rows by volume
    rows.sort((a, b) => b._totalBoxes - a._totalBoxes);

    return { columns: sortedPersons, rows };
  }, [filteredHistory]);


  return (
    <div className="space-y-6">
      {/* Top Stats Cards - Updated with new metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 col-span-2 md:col-span-1 lg:col-span-1">
            <h4 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1">总实收金额</h4>
            <div className="text-xl font-bold text-gray-900">¥{globalStats.sales.toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-1">{filteredHistory.length} 笔订单</div>
        </div>
        
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
             <h4 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Coins size={14}/> 总成本
            </h4>
             <div className="text-xl font-bold text-gray-700">¥{globalStats.totalCost.toLocaleString()}</div>
             <div className="text-[10px] text-gray-400 mt-1">所有商品成本价</div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
             <h4 className="text-gray-500 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Coins size={14}/> 总批发额
            </h4>
             <div className="text-xl font-bold text-gray-700">¥{globalStats.totalWholesale.toLocaleString()}</div>
             <div className="text-[10px] text-gray-400 mt-1">所有商品批发价</div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-green-200">
            <h4 className="text-green-600 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <TrendingUp size={14}/> 成本利润
            </h4>
            <div className="text-xl font-bold text-green-700">¥{globalStats.baseCostProfit.toLocaleString()}</div>
            <div className="text-[10px] text-green-600/60 mt-1">批发价 - 成本价</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-blue-200">
            <h4 className="text-blue-600 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <Wallet size={14}/> 批发收益
            </h4>
            <div className="text-xl font-bold text-blue-700">¥{globalStats.wholesaleSurplus.toLocaleString()}</div>
            <div className="text-[10px] text-blue-600/60 mt-1">扣除个人后盈余</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-orange-200">
            <h4 className="text-orange-600 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                <User size={14}/> 个人额外
            </h4>
            <div className="text-xl font-bold text-orange-700">¥{globalStats.personalExtra.toLocaleString()}</div>
             <div className="text-[10px] text-orange-600/60 mt-1">溢价部分</div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-end md:items-center justify-between z-10 relative">
         <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            {/* Person Selector */}
            <div className="flex flex-col gap-1 relative">
                <label className="text-xs text-gray-500 font-medium">经手人/客户筛选 (计算选中总额)</label>
                <button 
                  onClick={() => setIsPersonDropdownOpen(!isPersonDropdownOpen)}
                  className="flex items-center justify-between w-full md:w-48 px-3 py-2 border rounded-md text-sm bg-white hover:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-colors"
                >
                    <span className="truncate">
                        {selectedPersons.length === 0 
                            ? '全部人员' 
                            : `已选 ${selectedPersons.length} 人`}
                    </span>
                    <Users size={14} className="text-gray-400 ml-2"/>
                </button>
                
                {isPersonDropdownOpen && (
                    <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsPersonDropdownOpen(false)}></div>
                        <div className="absolute top-full left-0 mt-1 w-56 max-h-60 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-20 p-2">
                             <div className="mb-2 px-2 py-1 border-b border-gray-100 flex justify-between items-center">
                                 <span className="text-xs font-bold text-gray-500">选择人员</span>
                                 {selectedPersons.length > 0 && (
                                     <button onClick={clearPersonFilter} className="text-xs text-indigo-600 hover:text-indigo-800">清空</button>
                                 )}
                             </div>
                             <div className="space-y-1">
                                {allPersons.map(person => (
                                    <div 
                                        key={person} 
                                        onClick={() => togglePersonSelection(person)}
                                        className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer"
                                    >
                                        {selectedPersons.includes(person) 
                                            ? <CheckSquare size={16} className="text-indigo-600"/> 
                                            : <Square size={16} className="text-gray-300"/>}
                                        <span className={`text-sm ${selectedPersons.includes(person) ? 'text-indigo-700 font-medium' : 'text-gray-700'}`}>
                                            {person}
                                        </span>
                                    </div>
                                ))}
                             </div>
                        </div>
                    </>
                )}
            </div>

            <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-500 font-medium">日期范围</label>
                <div className="flex items-center gap-2">
                    <input 
                        type="date" 
                        className="border rounded-md px-2 py-2 text-sm text-gray-600"
                        value={filterStartDate}
                        onChange={(e) => setFilterStartDate(e.target.value)}
                    />
                    <span className="text-gray-400">-</span>
                     <input 
                        type="date" 
                         className="border rounded-md px-2 py-2 text-sm text-gray-600"
                         value={filterEndDate}
                         onChange={(e) => setFilterEndDate(e.target.value)}
                    />
                </div>
            </div>
         </div>

         <div className="flex gap-2 relative">
            <button 
                onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
                disabled={filteredHistory.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 transition text-sm disabled:opacity-50"
            >
                <Download size={16}/> 导出表格 <ChevronDown size={14}/>
            </button>
            
            {isExportDropdownOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsExportDropdownOpen(false)}></div>
                    <div className="absolute right-0 top-full mt-1 w-40 bg-white border border-gray-200 rounded-lg shadow-xl z-20 py-1">
                        <button 
                            onClick={() => {
                                exportHistoryToCSV(filteredHistory);
                                setIsExportDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                            导出明细 (订单级)
                        </button>
                        <button 
                            onClick={() => {
                                exportHistorySummaryToCSV(filteredHistory);
                                setIsExportDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                        >
                            导出汇总 (经手人)
                        </button>
                    </div>
                </>
            )}
         </div>
      </div>

      {/* View Tabs */}
      <div className="flex border-b border-gray-200">
        <button
            onClick={() => setViewMode('overview')}
            className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${viewMode === 'overview' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
            <List size={16}/> 订单明细
        </button>
        <button
            onClick={() => setViewMode('person_rank')}
            className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${viewMode === 'person_rank' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
            <BarChart3 size={16}/> 经手人汇总
        </button>
        <button
            onClick={() => setViewMode('product_matrix')}
            className={`px-4 py-2 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors ${viewMode === 'product_matrix' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
            <Users size={16}/> 商品-人员分布
        </button>
      </div>

      {/* Content Area */}
      <div>
          {viewMode === 'overview' && (
              <HistoryTable 
                history={filteredHistory} 
                inventory={inventory}
                onDelete={onDelete} 
                onUpdate={onUpdate}
              />
          )}

          {viewMode === 'person_rank' && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden overflow-x-auto">
                  <table className="w-full text-sm text-left">
                      <thead className="bg-gray-50 text-gray-500 font-medium">
                          <tr>
                              <th className="px-4 py-3">排名</th>
                              <th className="px-4 py-3">经手人</th>
                              <th className="px-4 py-3 text-right">订单数</th>
                              <th className="px-4 py-3 text-right">总成本</th>
                              <th className="px-4 py-3 text-right">总批发额</th>
                              <th className="px-4 py-3 text-right bg-indigo-50/50">实收金额</th>
                              <th className="px-4 py-3 text-right">成本利润</th>
                              <th className="px-4 py-3 text-right">批发收益</th>
                              <th className="px-4 py-3 text-right">个人额外</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                          {personStats.map((p, idx) => {
                              return (
                                  <tr key={p.name} className="hover:bg-gray-50">
                                      <td className="px-4 py-3 text-gray-400 font-mono w-16">#{idx + 1}</td>
                                      <td className="px-4 py-3 font-semibold text-gray-900">{p.name}</td>
                                      <td className="px-4 py-3 text-right text-gray-600">{p.count}</td>
                                      <td className="px-4 py-3 text-right text-gray-500">¥{p.totalCost.toLocaleString()}</td>
                                      <td className="px-4 py-3 text-right text-gray-500">¥{p.totalWholesale.toLocaleString()}</td>
                                      <td className="px-4 py-3 text-right font-bold text-gray-900 bg-indigo-50/50">¥{p.sales.toLocaleString()}</td>
                                      <td className="px-4 py-3 text-right font-bold text-green-600">¥{p.baseProfit.toLocaleString()}</td>
                                      <td className="px-4 py-3 text-right font-bold text-blue-600">¥{p.wholesaleSurplus.toLocaleString()}</td>
                                      <td className="px-4 py-3 text-right font-bold text-orange-600">¥{p.personalExtra.toLocaleString()}</td>
                                  </tr>
                              )
                          })}
                          {personStats.length === 0 && (
                              <tr><td colSpan={9} className="text-center py-8 text-gray-400">暂无数据</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>
          )}

          {viewMode === 'product_matrix' && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                      <thead>
                          <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                              <th className="p-3 min-w-[150px] sticky left-0 bg-gray-50 z-10 border-r border-gray-200 shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
                                  商品名称 \ 经手人
                              </th>
                              <th className="p-3 min-w-[100px] text-center bg-gray-100 font-bold border-r border-gray-200">
                                  总计
                              </th>
                              {productMatrix.columns.map(col => (
                                  <th key={col} className="p-3 min-w-[100px] text-center font-medium border-r border-gray-100">
                                      {col}
                                  </th>
                              ))}
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                          {productMatrix.rows.map((row) => (
                              <tr key={row.productName} className="hover:bg-blue-50/30 transition-colors">
                                  <td className="p-3 font-medium text-gray-800 sticky left-0 bg-white z-10 border-r border-gray-200 shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
                                      {row.productName}
                                  </td>
                                  <td className="p-3 text-center bg-gray-50 font-semibold border-r border-gray-200">
                                      {row._totalBoxes > 0 && <span>{row._totalBoxes}箱</span>}
                                      {row._totalUnits > 0 && <span className="text-gray-500 text-xs ml-1">+{row._totalUnits}个</span>}
                                  </td>
                                  {productMatrix.columns.map(col => {
                                      const cell = row[col];
                                      return (
                                          <td key={col} className="p-3 text-center border-r border-gray-100 text-gray-600">
                                              {cell ? (
                                                  <div className="flex flex-col items-center">
                                                      {cell.boxes > 0 && <span className="font-medium text-indigo-600">{cell.boxes}箱</span>}
                                                      {cell.units > 0 && <span className="text-xs text-gray-400">+{cell.units}个</span>}
                                                  </div>
                                              ) : (
                                                  <span className="text-gray-200">-</span>
                                              )}
                                          </td>
                                      )
                                  })}
                              </tr>
                          ))}
                           {productMatrix.rows.length === 0 && (
                              <tr><td colSpan={productMatrix.columns.length + 2} className="text-center py-8 text-gray-400">暂无数据</td></tr>
                          )}
                      </tbody>
                  </table>
                  <div className="p-2 text-xs text-gray-400 text-center bg-gray-50 border-t">
                      * 横向滚动查看所有经手人
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default StatisticsPanel;