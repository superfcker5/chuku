import React, { useEffect, useState } from 'react';
import { InventoryItem, OutboundRecord } from './types';
import * as storage from './services/storageService';
import InventoryManager from './components/InventoryManager';
import OutboundProcessor from './components/OutboundProcessor';
import StatisticsPanel from './components/StatisticsPanel';
import { LayoutDashboard, Package, ArrowUpRight, Download, Settings, Split, Database } from 'lucide-react';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'outbound' | 'history'>('outbound');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [history, setHistory] = useState<OutboundRecord[]>([]);
  const [showGlobalConfig, setShowGlobalConfig] = useState(false);
  const [apiKey, setApiKey] = useState('');
  
  // Data loading state to prevent overwriting DB with empty array on startup
  const [isDataLoaded, setIsDataLoaded] = useState(false);

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

  const handleOutboundCommit = (record: OutboundRecord) => {
    // 1. Add to history
    const newHistory = [record, ...history];
    setHistory(newHistory);

    // 2. Deduct from inventory based on per-item allocation
    const updatedInventory = inventory.map(item => {
      // Find all items in the record that matched this inventory item
      const recordItems = record.items.filter(ri => {
         return ri.invId === item.id; 
      });

      if (recordItems.length === 0) return item;

      const spec = item.spec > 0 ? item.spec : 1;
      
      // Calculate current total units for each warehouse
      const currentShuangUnits = ((item.stockShuangBoxes || 0) * spec) + (item.stockShuangUnits || 0);
      const currentFengUnits = ((item.stockFengBoxes || 0) * spec) + (item.stockFengUnits || 0);

      let deductShuangUnitsTotal = 0;
      let deductFengUnitsTotal = 0;

      recordItems.forEach(ri => {
        deductShuangUnitsTotal += (ri.outShuangBoxes * spec) + ri.outShuangUnits;
        deductFengUnitsTotal += (ri.outFengBoxes * spec) + ri.outFengUnits;
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

    setInventory(updatedInventory);
    setActiveTab('history');
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
                 <StatisticsPanel history={history} />
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