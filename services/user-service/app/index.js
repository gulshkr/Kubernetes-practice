'use strict';

const express = require('express');
const mongoose = require('mongoose');
const morgan = require('morgan');
const helmet = require('helmet');

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());                         // Security headers
app.use(express.json());                   // Parse JSON bodies
app.use(morgan('combined'));               // HTTP request logging (structured for ELK)

// ─── Environment Variables ─────────────────────────────────────────────────────
const PORT       = process.env.PORT       || 3000;
const MONGO_URI  = process.env.MONGO_URI  || 'mongodb://localhost:27017/proddb';
const SERVICE    = 'user-service';

// ─── MongoDB Schema ────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema(
  {
    name:  { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role:  { type: String, enum: ['user', 'admin'], default: 'user' },
  },
  { timestamps: true }
);
const User = mongoose.model('User', userSchema);

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check — used by Kubernetes liveness & readiness probes
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  if (dbState === 1) {
    return res.status(200).json({ status: 'ok', service: SERVICE, db: 'connected' });
  }
  return res.status(503).json({ status: 'error', service: SERVICE, db: 'disconnected' });
});

// List all users
app.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-__v').lean();
    res.json({ service: SERVICE, count: users.length, data: users });
  } catch (err) {
    console.error(`[${SERVICE}] GET /users error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single user by ID
app.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-__v').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ service: SERVICE, data: user });
  } catch (err) {
    console.error(`[${SERVICE}] GET /users/:id error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create user
app.post('/users', async (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: '`name` and `email` are required' });
  }
  try {
    const user = await User.create({ name, email, role });
    res.status(201).json({ service: SERVICE, data: user });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error(`[${SERVICE}] POST /users error:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete user
app.delete('/users/:id', async (req, res) => {
  try {
    const result = await User.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'User not found' });
    res.json({ service: SERVICE, message: 'User deleted successfully' });
  } catch (err) {
    console.error(`[${SERVICE}] DELETE /users/:id error:`, err.message);
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

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log(`[${SERVICE}] SIGTERM received. Shutting down gracefully...`);
  await mongoose.connection.close();
  process.exit(0);
});

start();
