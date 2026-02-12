import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import { User } from '../models/User.js';
import { UserBatch } from '../models/UserBatch.js';
import { env } from '../config/env.js';

const router = express.Router();

async function hasCompletedOnboarding(userId) {
  const primary = await UserBatch.findOne({ userId, isPrimary: true }).lean();
  return !!primary;
}

function signTokens(user) {
  const payload = {
    sub: user._id.toString(),
    email: user.email,
  };

  const accessToken = jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpire,
  });

  // For simplicity, we reuse the same secret; in a full impl you might separate.
  const refreshToken = jwt.sign(payload, env.jwtSecret, {
    expiresIn: '30d',
  });

  return { accessToken, refreshToken };
}

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name: fullName } = req.body;
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const verificationToken = crypto.randomBytes(32).toString('hex');

    const user = await User.create({
      email,
      passwordHash,
      fullName,
      verificationToken,
      isVerified: false,
    });

    // TODO: send verification email using env.email settings

    return res.status(201).json({
      user_id: user._id,
      email: user.email,
      message: 'Verification email sent',
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Missing credentials' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { accessToken, refreshToken } = signTokens(user);
    const completedOnboarding = await hasCompletedOnboarding(user._id);

    return res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user._id,
        email: user.email,
        full_name: user.fullName,
        has_completed_onboarding: completedOnboarding,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/v1/auth/verify-email
router.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    const user = await User.findOne({ verificationToken: token });
    if (!user) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    return res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

