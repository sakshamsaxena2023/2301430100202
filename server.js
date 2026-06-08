import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { loggingMiddleware, Log } from './logger.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const WINDOW_SIZE = Number(process.env.WINDOW_SIZE) || 10;
const AUTH_TOKEN = process.env.AFFORDMED_AUTH_TOKEN || 'PASTE_YOUR_RECEIVED_TOKEN_HERE';
const PRODUCT_BASE_URLS = (
  process.env.AFFORDMED_PRODUCT_BASE_URLS ||
  process.env.AFFORDMED_PRODUCTS_BASE_URL ||
  'http://20.244.56.144/test'
)
  .split(',')
  .map((baseUrl) => baseUrl.trim().replace(/\/$/, ''))
  .filter(Boolean);

const COMPANIES = ['AMZ', 'FLIP', 'SNP', 'MYN', 'HTC'];
const storedNumbersWindow = [];

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(loggingMiddleware);

const toPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const pushWindowValue = (value) => {
  if (!Number.isFinite(value)) return;

  if (storedNumbersWindow.length >= WINDOW_SIZE) {
    storedNumbersWindow.shift();
  }

  storedNumbersWindow.push(value);
};

const buildProductId = (company, product) => {
  const sourceId = product.id || product.productId || product.productName || product.name;
  return `${company}-${String(sourceId || randomUUID()).replace(/\s+/g, '-').toLowerCase()}`;
};

async function fetchCompanyProducts(company, category, top, minPrice, maxPrice) {
  for (const baseUrl of PRODUCT_BASE_URLS) {
    try {
      const url = `${baseUrl}/companies/${company}/categories/${category}/products`;

      const response = await axios.get(url, {
        params: { top, minPrice, maxPrice },
        headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
        timeout: 2800
      });

      const products = Array.isArray(response.data) ? response.data : response.data?.products;
      if (!Array.isArray(products)) return [];

      return products.map((product) => ({
        ...product,
        id: buildProductId(company, product),
        company
      }));
    } catch (err) {
      Log('backend', 'warn', 'controller', `Failed to fetch from ${company} at ${baseUrl}: ${err.message}`);
    }
  }

  return [];
}

app.get('/categories/:categoryname/products', async (req, res) => {
  const { categoryname } = req.params;
  const top = toPositiveInteger(req.query.top, 10);
  const minPrice = toPositiveInteger(req.query.minPrice, 1);
  const maxPrice = toPositiveInteger(req.query.maxPrice, 10000);
  const sortBy = req.query.sortBy;
  const order = req.query.order === 'desc' ? 'desc' : 'asc';
  const page = toPositiveInteger(req.query.page, 1);
  const windowPrevState = [...storedNumbersWindow];

  try {
    const resultsArray = await Promise.all(
      COMPANIES.map((company) => fetchCompanyProducts(company, categoryname, top, minPrice, maxPrice))
    );

    const uniqueProductsMap = new Map();
    for (const product of resultsArray.flat()) {
      if (!uniqueProductsMap.has(product.id)) {
        uniqueProductsMap.set(product.id, product);
      }
    }

    const uniqueProducts = Array.from(uniqueProductsMap.values());
    for (const product of uniqueProducts) {
      const priceVal = Number(product.price);
      pushWindowValue(priceVal);
    }

    const average =
      storedNumbersWindow.length === 0
        ? 0
        : Number((storedNumbersWindow.reduce((acc, curr) => acc + curr, 0) / storedNumbersWindow.length).toFixed(2));

    if (sortBy) {
      uniqueProducts.sort((a, b) => {
        const valA = Number(a[sortBy]) || 0;
        const valB = Number(b[sortBy]) || 0;
        return order === 'desc' ? valB - valA : valA - valB;
      });
    }

    const startIndex = (page - 1) * top;
    const products = uniqueProducts.slice(startIndex, startIndex + top);

    return res.json({
      windowPrevState,
      windowCurrState: [...storedNumbersWindow],
      products,
      average
    });
  } catch (globalError) {
    Log('backend', 'error', 'controller', `Core endpoint failed: ${globalError.message}`);
    return res.status(500).json({ error: 'Aggregation pipeline processing failed.' });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Microservice core engine is active.',
    endpoints: ['/categories/:categoryname/products']
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  Log('backend', 'info', 'controller', `Microservice started on port ${PORT}`);
});
