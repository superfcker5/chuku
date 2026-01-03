import { ImportPreviewItem } from "../types";

const getApiKey = () => {
  return localStorage.getItem("PYRO_API_KEY") || process.env.API_KEY;
};

// DeepSeek API Configuration
const API_URL = "https://api.deepseek.com/chat/completions";

/**
 * Call DeepSeek API
 */
const callDeepSeek = async (systemPrompt: string, userContent: string) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("请先点击右上角设置配置 DeepSeek API Key");
  }

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat", // or deepseek-reasoner based on needs, chat is usually faster/cheaper for JSON
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        response_format: { type: "json_object" },
        stream: false
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || "DeepSeek API Call Failed");
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error("DeepSeek API Error:", error);
    throw error;
  }
};

/**
 * Parse Inventory using DeepSeek
 */
export const parseInventoryImport = async (text: string): Promise<ImportPreviewItem[]> => {
  const systemPrompt = `You are a data extraction assistant. Output valid JSON only.
  Extract inventory data. 
  Rules:
  1. Identify: Name, Spec (units/box), Cost Price (per box), Wholesale Price (per box), Stock (boxes).
  2. Optional Identify: Cost Price (per unit), Wholesale Price (per unit).
  3. If spec missing, default 1. If stock missing, default 0.
  4. Clean Name: Remove newlines.
  5. Output Format: Array of objects with keys: name, spec, costPriceBox, wholesalePriceBox, stockBoxes, costPriceUnit (opt), wholesalePriceUnit (opt).`;

  try {
    const result = await callDeepSeek(systemPrompt, text);
    // Handle case where DeepSeek wraps array in an object key like "items"
    const items = Array.isArray(result) ? result : (result.items || result.inventory || []);
    
    return items.map((item: any) => ({
      name: item.name ? String(item.name).replace(/[\r\n]+/g, '').trim() : "未知商品",
      spec: Number(item.spec) || 1,
      costPriceBox: Number(item.costPriceBox) || 0,
      wholesalePriceBox: Number(item.wholesalePriceBox) || 0,
      stockBoxes: Number(item.stockBoxes) || 0,
      // Pass through unit prices if AI found them
      costPriceUnit: Number(item.costPriceUnit) || 0,
      wholesalePriceUnit: Number(item.wholesalePriceUnit) || 0,
    }));
  } catch (error) {
    throw error;
  }
};

/**
 * Parse Outbound using DeepSeek
 */
export const parseOutboundAI = async (text: string) => {
  const systemPrompt = `You are a sales parser. Output valid JSON only.
  Parse sales text.
  Rules:
  1. Extract Date, Person/Customer Name.
  2. Extract Items: productName, qtyBoxes, qtyUnits, soldPrice (TOTAL price for this line item).
  3. Keep Product Name exact but remove newlines.
  4. Output Format: { date: string, person: string, items: [{ productName, qtyBoxes, qtyUnits, soldPrice }] }`;

  try {
    const result = await callDeepSeek(systemPrompt, text);
    return result;
  } catch (error) {
    throw error;
  }
};