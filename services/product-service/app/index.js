'use strict';

const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const helmet = require('helmet');

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(express.json());
app.use(morgan('combined'));

// ─── Environment Variables ─────────────────────────────────────────────────────
const PORT      = process.env.PORT      || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/proddb';
const SERVICE   = 'product-service';

// ─── MongoDB Schema ────────────────────────────────────────────────────────────
const productSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price:       { type: Number, required: true, min: 0 },
    stock:       { type: Number, default: 0, min: 0 },
    category:    { type: String, default: 'general' },
  },
  { timestamps: true }
);
const Product = mongoose.model('Product', productSchema);

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check — Kubernetes liveness & readiness probe
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  if (dbState === 1) {
    return res.status(200).json({ status: 'ok', service: SERVICE, db: 'connected' });
  }
  return res.status(503).json({ status: 'error', service: SERVICE, db: 'disconnected' });
});

// List all products
app.get('/products', async (req, res) => {
  try {
    const { category } = req.query;
    const filter = category ? { category } : {};
    const products = await Product.find(filter).select('-__v').lean();
    res.json({ service: SERVICE, count: products.length, data: products });
  } catch (err) {
    console.error(`[${SERVICE}] GET /products error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single product by ID
app.get('/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).select('-__v').lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ service: SERVICE, data: product });
  } catch (err) {
    console.error(`[${SERVICE}] GET /products/:id error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create product
app.post('/products', async (req, res) => {
  const { name, price, description, stock, category } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ error: '`name` and `price` are required' });
  }
  try {
    const product = await Product.create({ name, price, description, stock, category });
    res.status(201).json({ service: SERVICE, data: product });
  } catch (err) {
    console.error(`[${SERVICE}] POST /products error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update product
app.put('/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).select('-__v');
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ service: SERVICE, data: product });
  } catch (err) {
    console.error(`[${SERVICE}] PUT /products/:id error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete product
app.delete('/products/:id', async (req, res) => {
  try {
    const result = await Product.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Product not found' });
    res.json({ service: SERVICE, message: 'Product deleted successfully' });
  } catch (err) {
    console.error(`[${SERVICE}] DELETE /products/:id error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function start() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    console.log(`[${SERVICE}] MongoDB connected`);
    app.listen(PORT, () => {
      console.log(`[${SERVICE}] Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error(`[${SERVICE}] Failed to connect to MongoDB:`, err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  console.log(`[${SERVICE}] SIGTERM received. Shutting down gracefully...`);
  await mongoose.connection.close();
  process.exit(0);
});

start();
