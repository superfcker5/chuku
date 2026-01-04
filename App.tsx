import React, { useEffect, useState, useRef } from 'react';
import { InventoryItem, OutboundRecord } from './types';
import * as storage from './services/storageService';
import InventoryManager from './components/InventoryManager';
import OutboundProcessor from './components/OutboundProcessor';
import StatisticsPanel from './components/StatisticsPanel';
import { LayoutDashboard, Package, ArrowUpRight, Settings, Split, Database, UploadCloud } from 'lucide-react';
import { dbService } from './services/db';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'outbound' | 'history'>('outbound');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<OutboundRecord[]>([]);
  const [showGlobalConfig, setShowGlobalConfig] = useState(false);
  const [apiKey, setApiKey] = useState('');
  
  // Data loading state to prevent overwriting DB with empty array on startup
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load data on mount (Async for DB)
  useEffect(() => {
    const initData = async () => {
      try {
        const [loadedInventory, loadedHistory] = await Promise.all([
          storage.loadInventory(),
          storage.loadHistory()
        ]);
        setInventory(loadedInventory);
        setHistory(loadedHistory);
        setIsDataLoaded(true); // Enable auto-save
      } catch (e) {
        console.error("Initialization failed:", e);
        setIsDataLoaded(true); // Enable anyway so app is usable even if DB fails
      }
    };
    initData();
    setApiKey(localStorage.getItem('PYRO_API_KEY') || '');
  }, []);

  // Save data on change (Only after initial load)
  useEffect(() => {
    if (isDataLoaded) {
      storage.saveInventory(inventory);
    }
  }, [inventory, isDataLoaded]);

  useEffect(() => {
    if (isDataLoaded) {
      storage.saveHistory(history);
    }
  }, [history, isDataLoaded]);

  const saveApiKey = () => {
      localStorage.setItem('PYRO_API_KEY', apiKey);
      setShowGlobalConfig(false);
      alert("API Key 已更新，AI 功能将使用新 Key。");
  };

  const handleRestoreData = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
          try {
              const json = JSON.parse(event.target?.result as string);
              if (json.inventory && Array.isArray(json.inventory) && json.history && Array.isArray(json.history)) {
                  if (window.confirm(`确认恢复数据？\n这将覆盖当前所有数据！\n包含: ${json.inventory.length} 个库存商品, ${json.history.length} 条历史记录。`)) {
                      // Update State
                      setInventory(json.inventory);
                      setHistory(json.history);
                      
                      // Force save to DB immediately
                      await dbService.saveAll(dbService.STORES.INVENTORY, json.inventory);
                      await dbService.saveAll(dbService.STORES.HISTORY, json.history);
                      
                      alert("数据恢复成功！");
                  }
              } else {
                  alert("无效的备份文件格式。");
              }
          } catch (err) {
              console.error(err);
              alert("读取文件失败，请确保是正确的 JSON 备份文件。");
          }
          if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsText(file);
  };

  const handleOutboundCommit = (record: OutboundRecord) => {
    // 1. Add to history (Functional Update)
    const recordWithLog = {
        ...record,
        historyLogs: [{
            date: new Date().toLocaleString(),
            action: 'CREATE' as const,
            details: '订单创建'
        }]
    };
    
    setHistory(prev => [recordWithLog, ...prev]);

    // 2. Deduct from inventory based on per-item allocation (Functional Update)
    setInventory(prevInventory => {
        return prevInventory.map(item => {
          // Find all items in the record that matched this inventory item
          const recordItems = record.items.filter(ri => ri.invId === item.id);

          if (recordItems.length === 0) return item;

          const spec = item.spec > 0 ? item.spec : 1;
          
          // Calculate current total units for each warehouse
          const currentShuangUnits = ((Number(item.stockShuangBoxes) || 0) * spec) + (Number(item.stockShuangUnits) || 0);
          const currentFengUnits = ((Number(item.stockFengBoxes) || 0) * spec) + (Number(item.stockFengUnits) || 0);

          let deductShuangUnitsTotal = 0;
          let deductFengUnitsTotal = 0;

          recordItems.forEach(ri => {
            deductShuangUnitsTotal += (Number(ri.outShuangBoxes) * spec) + Number(ri.outShuangUnits);
            deductFengUnitsTotal += (Number(ri.outFengBoxes) * spec) + Number(ri.outFengUnits);
          });

          const newShuangUnits = currentShuangUnits - deductShuangUnitsTotal;
          const newFengUnits = currentFengUnits - deductFengUnitsTotal;

          // Convert back to Boxes + Units
          const newShuangStockBoxes = Math.trunc(newShuangUnits / spec);
          const newShuangStockUnits = Number((newShuangUnits % spec).toFixed(4));
          
          const newFengStockBoxes = Math.trunc(newFengUnits / spec);
          const newFengStockUnits = Number((newFengUnits % spec).toFixed(4));

          return {
              ...item,
              stockShuangBoxes: newShuangStockBoxes,
              stockShuangUnits: newShuangStockUnits,
              stockFengBoxes: newFengStockBoxes,
              stockFengUnits: newFengStockUnits
          };
        });
    });

    setActiveTab('history');
  };

  const handleDeleteHistory = (recordToDelete: OutboundRecord) => {
    // Direct Access: We rely on the record passed from the UI, ensuring we have the exact data to restore.
    
    // 1. Restore Inventory (Side Effect: Update Inventory State)
    setInventory(prevInventory => {
        return prevInventory.map(invItem => {
            const recItems = recordToDelete.items.filter(ri => ri.invId === invItem.id);
            if (recItems.length === 0) return invItem;

            const spec = invItem.spec || 1;
            let totalShuangUnits = ((Number(invItem.stockShuangBoxes)||0) * spec) + (Number(invItem.stockShuangUnits)||0);
            let totalFengUnits = ((Number(invItem.stockFengBoxes)||0) * spec) + (Number(invItem.stockFengUnits)||0);

            // Add back the quantities from the deleted record
            recItems.forEach(ri => {
                totalShuangUnits += (Number(ri.outShuangBoxes)||0) * spec + (Number(ri.outShuangUnits)||0);
                totalFengUnits += (Number(ri.outFengBoxes)||0) * spec + (Number(ri.outFengUnits)||0);
            });

            return {
                ...invItem,
                stockShuangBoxes: Math.trunc(totalShuangUnits / spec),
                stockShuangUnits: Number((totalShuangUnits % spec).toFixed(4)),
                stockFengBoxes: Math.trunc(totalFengUnits / spec),
                stockFengUnits: Number((totalFengUnits % spec).toFixed(4)),
            };
        });
    });

    // 2. Update History (Remove Record)
    setHistory(prevHistory => prevHistory.filter(h => h.id !== recordToDelete.id));
  };

  const handleUpdateHistory = (newRecord: OutboundRecord) => {
    // 1. Find the old record to revert
    const oldRecord = history.find(r => r.id === newRecord.id);
    if (!oldRecord) {
        console.error("Old record not found for update");
        return;
    }

    // 2. Update Inventory: Revert Old -> Apply New
    setInventory(prevInventory => {
        return prevInventory.map(invItem => {
            // Revert Old
            const oldItems = oldRecord.items.filter(ri => ri.invId === invItem.id);
            // Apply New
            const newItems = newRecord.items.filter(ri => ri.invId === invItem.id);
            
            if (oldItems.length === 0 && newItems.length === 0) return invItem;

            const spec = invItem.spec || 1;
            let totalShuangUnits = ((Number(invItem.stockShuangBoxes)||0) * spec) + (Number(invItem.stockShuangUnits)||0);
            let totalFengUnits = ((Number(invItem.stockFengBoxes)||0) * spec) + (Number(invItem.stockFengUnits)||0);

            // Add back old (Revert)
            oldItems.forEach(ri => {
                totalShuangUnits += (Number(ri.outShuangBoxes)||0) * spec + (Number(ri.outShuangUnits)||0);
                totalFengUnits += (Number(ri.outFengBoxes)||0) * spec + (Number(ri.outFengUnits)||0);
            });

            // Subtract new (Apply)
            newItems.forEach(ri => {
                totalShuangUnits -= (Number(ri.outShuangBoxes)||0) * spec + (Number(ri.outShuangUnits)||0);
                totalFengUnits -= (Number(ri.outFengBoxes)||0) * spec + (Number(ri.outFengUnits)||0);
            });

            return {
                ...invItem,
                stockShuangBoxes: Math.trunc(totalShuangUnits / spec),
                stockShuangUnits: Number((totalShuangUnits % spec).toFixed(4)),
                stockFengBoxes: Math.trunc(totalFengUnits / spec),
                stockFengUnits: Number((totalFengUnits % spec).toFixed(4)),
            };
        });
    });

    // 3. Update History Record
    setHistory(prevHistory => prevHistory.map(r => r.id === newRecord.id ? newRecord : r));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded text-white">
              <Package size={20} />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">PyroTrack <span className="text-indigo-600">进销存</span></h1>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={() => setShowGlobalConfig(true)} className="text-gray-500 hover:text-indigo-600 flex items-center gap-1 text-sm">
                <Settings size={16} /> API 配置
             </button>
             <button onClick={storage.exportData} className="text-gray-500 hover:text-gray-900 flex items-center gap-1 text-sm">
                <Database size={16} /> 备份数据
             </button>
             <button onClick={() => fileInputRef.current?.click()} className="text-gray-500 hover:text-blue-600 flex items-center gap-1 text-sm">
                <UploadCloud size={16} /> 恢复数据
             </button>
             <input type="file" ref={fileInputRef} onChange={handleRestoreData} className="hidden" accept=".json"/>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        
        {/* Navigation Tabs */}
        <div className="flex space-x-1 rounded-xl bg-gray-200 p-1 mb-8 max-w-md">
          <button
            onClick={() => setActiveTab('outbound')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
              activeTab === 'outbound'
                ? 'bg-white text-indigo-700 shadow'
                : 'text-gray-600 hover:bg-white/[0.12] hover:text-gray-800'
            }`}
          >
            <ArrowUpRight size={16} /> 出库录入
          </button>
          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
              activeTab === 'inventory'
                ? 'bg-white text-indigo-700 shadow'
                : 'text-gray-600 hover:bg-white/[0.12] hover:text-gray-800'
            }`}
          >
            <Package size={16} /> 库存管理
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2 ${
              activeTab === 'history'
                ? 'bg-white text-indigo-700 shadow'
                : 'text-gray-600 hover:bg-white/[0.12] hover:text-gray-800'
            }`}
          >
            <LayoutDashboard size={16} /> 统计分析
          </button>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {!isDataLoaded ? (
             <div className="flex justify-center items-center py-20">
                 <div className="text-gray-400 text-lg animate-pulse">正在加载数据库...</div>
             </div>
          ) : (
            <>
              {activeTab === 'outbound' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">文本解析录入</h3>
                    <OutboundProcessor inventory={inventory} onCommit={handleOutboundCommit} />
                  </div>
                  <div className="hidden lg:block bg-indigo-50 rounded-xl p-8 border border-indigo-100 flex flex-col justify-center items-center text-center">
                     <div className="bg-white p-4 rounded-full shadow-md mb-4">
                        <Split className="text-indigo-600" size={48} />
                     </div>
                     <h4 className="text-indigo-900 font-bold text-xl mb-2">智能分仓出库</h4>
                     <p className="text-indigo-700/80 max-w-xs">
                       系统解析后默认全量分配给“峰仓”。您可以在右侧输入框快速划拨“爽仓”的出货数量，系统自动平衡库存扣减。
                     </p>
                     <div className="mt-6 text-xs text-indigo-400">
                        支持正则快速解析与 DeepSeek 智能语义分析
                     </div>
                  </div>
                </div>
              )}

              {activeTab === 'inventory' && (
                <InventoryManager inventory={inventory} setInventory={setInventory} />
              )}

              {activeTab === 'history' && (
                 <StatisticsPanel 
                    history={history} 
                    inventory={inventory}
                    onDelete={handleDeleteHistory}
                    onUpdate={handleUpdateHistory}
                 />
              )}
            </>
          )}
        </div>

        {/* Global Config Modal */}
        {showGlobalConfig && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                 <div className="bg-white w-full max-w-md p-6 rounded-lg shadow-xl">
                    <h3 className="text-lg font-bold mb-4">系统设置</h3>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">DeepSeek API Key</label>
                        <input 
                            type="password" 
                            className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 outline-none" 
                            placeholder="sk-..."
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Key 将存储在本地浏览器中，用于调用 DeepSeek V3/R1 模型进行智能解析。
                        </p>
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button onClick={() => setShowGlobalConfig(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">取消</button>
                        <button onClick={saveApiKey} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">保存设置</button>
                    </div>
                 </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;