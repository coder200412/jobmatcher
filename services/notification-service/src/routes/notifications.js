const express = require('express');
const jwt = require('jsonwebtoken');
const { query } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret';

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}

// ── GET /api/notifications ────────────────────────────
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    let sql = `SELECT * FROM notification_service.notifications WHERE user_id = $1`;
    const params = [req.user.id];
    let idx = 2;

    if (unreadOnly === 'true') {
      sql += ` AND is_read = false`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await query(sql, params);

    // Unread count
    const countResult = await query(
      'SELECT COUNT(*) FROM notification_service.notifications WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );

    res.json({
      notifications: result.rows.map(r => ({
        id: r.id,
        type: r.type,
        title: r.title,
        message: r.message,
        data: r.data,
        isRead: r.is_read,
        createdAt: r.created_at,
      })),
      unreadCount: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/notifications/:id/read ───────────────────
router.put('/:id/read', authMiddleware, async (req, res, next) => {
  try {
    await query(
      'UPDATE notification_service.notifications SET is_read = true WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Marked as read' });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/notifications/read-all ───────────────────
router.put('/read-all', authMiddleware, async (req, res, next) => {
  try {
    await query(
      'UPDATE notification_service.notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ message: 'All marked as read' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
