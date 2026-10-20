const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const port = 3000;

// JWT 密钥
const SECRET_KEY = 'your_super_secret_key';

app.use(cors());
app.use(express.json());

// 1. 初始化 SQLite 数据库
const db = new sqlite3.Database('./users.db', (err) => {
    if (err) {
        console.error('Database connection failed:', err.message);
    } else {
        console.log('Connected to SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )`);

     db.run(`CREATE TABLE IF NOT EXISTS requests (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       shift_id INTEGER NOT NULL,
       sender_id INTEGER NOT NULL,
       receiver_id INTEGER,
       candidate_id INTEGER,
       request_type TEXT NOT NULL,
       status TEXT DEFAULT 'open',
       created_at TEXT DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY(shift_id) REFERENCES shifts(id),
       FOREIGN KEY(sender_id) REFERENCES users(id),
       FOREIGN KEY(receiver_id) REFERENCES users(id),
       FOREIGN KEY(candidate_id) REFERENCES users(id)
     )`);

     db.run(`CREATE TABLE IF NOT EXISTS shifts (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER,
         date TEXT NOT NULL,
         time TEXT NOT NULL,
         status TEXT NOT NULL DEFAULT 'available',
         requested_by INTEGER,
         FOREIGN KEY(user_id) REFERENCES users(id),
         FOREIGN KEY(requested_by) REFERENCES users(id)
     )`);

    // Create shifts table
    db.run(`CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        assigner_id INTEGER NOT NULL,
        assignee_id INTEGER,
        request_id INTEGER,
        text TEXT NOT NULL,
        completed BOOLEAN DEFAULT 0,
        FOREIGN KEY(assigner_id) REFERENCES users(id),
        FOREIGN KEY(assignee_id) REFERENCES users(id),
        FOREIGN KEY(request_id) REFERENCES requests(id)
    )`);

// Create default admin user if not exists
db.get("SELECT * FROM users WHERE username = ?", ["admin"], async (err, row) => {
    if (err) {
        console.error("Error checking admin user:", err);
        return;
    }

    if (!row) {
        try {
            const hashedPassword = await bcrypt.hash("123456", 10);

            db.run(
                "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
                ["admin", "admin@example.com", hashedPassword],
                (err) => {
                    if (err) {
                        console.error("Error creating admin user:", err);
                    } else {
                        console.log("Default admin account created: admin / 123456");
                    }
                }
            );
        } catch (error) {
            console.error("Error hashing admin password:", error);
        }
    } else {
        console.log("Admin account already exists");
    }
});
    }
});

// 2. 用户注册 API
app.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: '用户名、邮箱和密码不能为空' });
    }

    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const stmt = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
        stmt.run([username, email, hashedPassword], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed: users.email')) {
                    return res.status(409).json({ error: '该邮箱已被注册' });
                }
                if (err.message.includes('UNIQUE constraint failed: users.username')) {
                    return res.status(409).json({ error: '用户名已被注册，请尝试其他用户名' });
                }
                return res.status(500).json({ error: '注册失败，数据库错误' });
            }

            res.status(201).json({
                message: '用户注册成功',
                userId: this.lastID
            });
        });
        stmt.finalize();
    } catch (error) {
        console.error('注册过程抛出异常:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 3. 用户登录 API
app.post('/login', (req, res) => {
    // 登录时仅使用用户名
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: '服务器内部错误' });
        }

        if (!user) {
            return res.status(401).json({ error: '用户不存在或密码错误' });
        }

        try {
            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                return res.status(401).json({ error: '用户名或密码错误' });
            }

            const token = jwt.sign(
                { id: user.id, username: user.username, email: user.email },
                SECRET_KEY,
                { expiresIn: '1h' }
            );

            res.status(200).json({
                message: '登录成功',
                token: token,
                email: user.email // 将邮箱信息作为响应直接返回给前端
            });
        } catch (error) {
            console.error('登录验证过程抛出异常:', error);
            res.status(500).json({ error: '服务器内部错误' });
        }
    });
});

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer TOKEN

    if (token == null) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Forbidden' });
        req.user = user;
        next();
    });
}

// Middleware to check admin
function requireAdmin(req, res, next) {
    if (req.user.username !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// 4. 获取所有用户列表 (除了当前用户) API
app.get('/users', authenticateToken, (req, res) => {
    db.all('SELECT id, username FROM users WHERE id != ?', [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: '数据库错误' });
        res.json(rows);
    });
});

// Get all available shifts
app.get('/shifts/available', authenticateToken, (req, res) => {
    const query = `
        SELECT id, date, time, status
        FROM shifts
        WHERE status = 'available'
        ORDER BY date ASC, id ASC
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error('Error fetching available shifts:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json(rows);
    });
});

    // Admin: create a new shift
    app.post('/admin/shifts', authenticateToken, requireAdmin, (req, res) => {
        const { user_id, date, time } = req.body;

        if (!user_id || !date || !time) {
            return res.status(400).json({ error: 'user_id, date, and time are required' });
        }

        const query = `
            INSERT INTO shifts (user_id, date, time, status, requested_by)
            VALUES (?, ?, ?, 'assigned', NULL)
        `;

        db.run(query, [user_id, date, time], function (err) {
            if (err) {
                console.error('Error creating shift:', err);
                return res.status(500).json({ error: 'Failed to create shift' });
            }

            res.status(201).json({
                message: 'Shift created successfully',
                id: this.lastID
            });
        });
    });

    // Admin: create an available shift
    app.post('/admin/available-shifts', authenticateToken, requireAdmin, (req, res) => {
        const { date, time } = req.body;

        if (!date || !time) {
            return res.status(400).json({ error: 'date and time are required' });
        }

        const query = `
            INSERT INTO shifts (user_id, date, time, status, requested_by)
            VALUES (NULL, ?, ?, 'available', NULL)
        `;

        db.run(query, [date, time], function (err) {
            if (err) {
                console.error('Error creating available shift:', err);
                return res.status(500).json({ error: 'Failed to create available shift' });
            }

            res.status(201).json({
                message: 'Available shift created successfully',
                id: this.lastID
            });
        });
    });

    // Admin: get all assigned shifts
    app.get('/admin/shifts', authenticateToken, requireAdmin, (req, res) => {
        const query = `
            SELECT
                s.id,
                s.date,
                s.time,
                s.status,
                u.username AS employee_name
            FROM shifts s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.status = 'assigned'
            ORDER BY s.date ASC, s.id ASC
        `;

        db.all(query, [], (err, rows) => {
            if (err) {
                console.error('Error fetching admin shifts:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.json(rows);
        });
    });

    // Get current user's shifts
    app.get('/shifts/mine', authenticateToken, (req, res) => {
        const query = `
            SELECT id, date, time, status
            FROM shifts
            WHERE user_id = ?
            ORDER BY date ASC, id ASC
        `;

        db.all(query, [req.user.id], (err, rows) => {
            if (err) {
                console.error('Error fetching user shifts:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            res.json(rows);
        });
    });

    // Update a shift
    app.put('/shifts/:id', authenticateToken, (req, res) => {
        const { date, time } = req.body;

        const query = `
            UPDATE shifts
            SET date = ?, time = ?
            WHERE id = ? AND user_id = ?
        `;

        db.run(query, [date, time, req.params.id, req.user.id], function (err) {
            if (err) {
                console.error('Error updating shift:', err);
                return res.status(500).json({ error: 'Failed to update shift' });
            }

            if (this.changes === 0) {
                return res.status(403).json({ error: 'Not allowed or shift not found' });
            }

            res.json({ message: 'Shift updated successfully' });
        });
    });

    // Delete a shift
    app.delete('/shifts/:id', authenticateToken, (req, res) => {
        const query = `
            DELETE FROM shifts
            WHERE id = ? AND user_id = ?
        `;

        db.run(query, [req.params.id, req.user.id], function (err) {
            if (err) {
                console.error('Error deleting shift:', err);
                return res.status(500).json({ error: 'Failed to delete shift' });
            }

            if (this.changes === 0) {
                return res.status(403).json({ error: 'Not allowed or shift not found' });
            }

            res.json({ message: 'Shift deleted successfully' });
        });
    });

    // Get current user's requests
   app.get('/requests', authenticateToken, (req, res) => {
       const isAdmin = req.user.username === 'admin';

       const query = isAdmin
           ? `
               SELECT
                   r.id,
                   r.shift_id,
                   r.sender_id,
                   r.receiver_id,
                   r.candidate_id,
                   r.request_type,
                   r.status,
                   r.created_at,

                   sh.date,
                   sh.time,

                   sender.username   AS sender_name,
                   receiver.username AS receiver_name,
                   candidate.username AS candidate_name

               FROM requests r
               JOIN shifts sh ON r.shift_id = sh.id
               LEFT JOIN users sender   ON r.sender_id = sender.id
               LEFT JOIN users receiver ON r.receiver_id = receiver.id
               LEFT JOIN users candidate ON r.candidate_id = candidate.id
               ORDER BY r.id DESC
           `
           : `
               SELECT
                   r.id,
                   r.shift_id,
                   r.sender_id,
                   r.receiver_id,
                   r.candidate_id,
                   r.request_type,
                   r.status,
                   r.created_at,

                   sh.date,
                   sh.time,

                   sender.username   AS sender_name,
                   receiver.username AS receiver_name,
                   candidate.username AS candidate_name

               FROM requests r
               JOIN shifts sh ON r.shift_id = sh.id
               LEFT JOIN users sender   ON r.sender_id = sender.id
               LEFT JOIN users receiver ON r.receiver_id = receiver.id
               LEFT JOIN users candidate ON r.candidate_id = candidate.id
               WHERE r.sender_id = ? OR r.candidate_id = ? OR r.receiver_id = ?
               ORDER BY r.id DESC
           `;

       const params = isAdmin ? [] : [req.user.id, req.user.id, req.user.id];

       db.all(query, params, (err, rows) => {
           if (err) {
               console.error('Error fetching requests:', err);
               return res.status(500).json({ error: 'Database error' });
           }

           const formatted = rows.map(r => ({
               id: r.id,
               shift_id: r.shift_id,
               sender_id: r.sender_id,
               receiver_id: r.receiver_id,
               candidate_id: r.candidate_id,
               request_type: r.request_type,
               status: r.status,
               created_at: r.created_at,

               date: r.date,
               time: r.time,

               sender_name: r.sender_name,
               receiver_name: r.receiver_name,
               candidate_name: r.candidate_name,

               is_sender: r.sender_id === req.user.id,
               is_receiver: r.receiver_id === req.user.id,
               is_candidate: r.candidate_id === req.user.id
           }));

           res.json(formatted);
       });
   });

// Create a request (swap / cover)
app.post('/requests', authenticateToken, (req, res) => {
    const { shift_id, request_type, receiver_id } = req.body;

    if (!shift_id || !request_type) {
        return res.status(400).json({ error: 'shift_id and request_type are required' });
    }

    if (!['anyone', 'specific'].includes(request_type)) {
        return res.status(400).json({ error: 'Invalid request type' });
    }

    db.get(
        `SELECT * FROM shifts WHERE id = ? AND user_id = ?`,
        [shift_id, req.user.id],
        (err, shift) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!shift) {
                return res.status(403).json({ error: 'You can only request your own shift' });
            }

            db.get(
                `SELECT * FROM requests
                 WHERE shift_id = ? AND status IN ('open','waiting_response','pending_admin')`,
                [shift_id],
                (err, existing) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    if (existing) {
                        return res.status(400).json({ error: 'This shift already has an active request' });
                    }

                    let status = '';
                    let receiver = null;

                    if (request_type === 'anyone') {
                        status = 'open';
                    } else {
                        if (!receiver_id) {
                            return res.status(400).json({ error: 'receiver_id required for specific request' });
                        }
                        status = 'waiting_response';
                        receiver = receiver_id;
                    }

                    db.run(
                        `INSERT INTO requests
                        (shift_id, sender_id, receiver_id, request_type, status)
                        VALUES (?, ?, ?, ?, ?)`,
                        [shift_id, req.user.id, receiver, request_type, status],
                        function (err) {
                            if (err) {
                                console.error(err);
                                return res.status(500).json({ error: 'Failed to create request' });
                            }

                            const requestId = this.lastID;

                            if (request_type === 'specific') {
                                const todoText = `Shift swap request: ${shift.date} ${shift.time}`;

                                db.run(
                                    `INSERT INTO todos (assigner_id, assignee_id, request_id, text, completed)
                                     VALUES (?, ?, ?, ?, 0)`,
                                    [req.user.id, receiver, requestId, todoText],
                                    function (todoErr) {
                                        if (todoErr) {
                                            console.error(todoErr);
                                            return res.status(500).json({ error: 'Request created, but failed to create todo' });
                                        }

                                        return res.status(201).json({
                                            message: 'Request created',
                                            request_id: requestId
                                        });
                                    }
                                );
                            } else {
                                return res.status(201).json({
                                    message: 'Request created',
                                    request_id: requestId
                                });
                            }
                        }
                    );
                }
            );
        }
    );
});

// Specific request: designated person accepts or rejects
app.put('/requests/:id/respond', authenticateToken, (req, res) => {
    const requestId = req.params.id;
    const { action } = req.body; // accept / reject

    if (!['accept', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }

    db.get(`SELECT * FROM requests WHERE id = ?`, [requestId], (err, request) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }

        if (request.request_type !== 'specific') {
            return res.status(400).json({ error: 'Only specific requests can use this endpoint' });
        }

        if (request.receiver_id !== req.user.id) {
            return res.status(403).json({ error: 'Only the designated recipient can respond' });
        }

        if (request.status !== 'waiting_response') {
            return res.status(400).json({ error: 'This request is no longer waiting for response' });
        }

        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            if (action === 'accept') {
                db.run(
                    `UPDATE requests
                     SET candidate_id = ?, status = 'pending_admin'
                     WHERE id = ? AND status = 'waiting_response'`,
                    [req.user.id, requestId],
                    function (err) {
                        if (err) {
                            console.error(err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to accept request' });
                        }

                        if (this.changes === 0) {
                            db.run('ROLLBACK');
                            return res.status(400).json({ error: 'This request is no longer waiting for response' });
                        }

                        db.run(
                            `UPDATE todos
                             SET completed = 1
                             WHERE request_id = ? AND assignee_id = ?`,
                            [requestId, req.user.id],
                            function (err) {
                                if (err) {
                                    console.error(err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Failed to update todo' });
                                }

                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        console.error(err);
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Transaction failed' });
                                    }

                                    res.json({ message: 'Accepted. Waiting for admin approval.' });
                                });
                            }
                        );
                    }
                );
            } else {
                db.run(
                    `UPDATE requests
                     SET status = 'rejected'
                     WHERE id = ? AND status = 'waiting_response'`,
                    [requestId],
                    function (err) {
                        if (err) {
                            console.error(err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to reject request' });
                        }

                        if (this.changes === 0) {
                            db.run('ROLLBACK');
                            return res.status(400).json({ error: 'This request is no longer waiting for response' });
                        }

                        db.run(
                            `UPDATE todos
                             SET completed = 1
                             WHERE request_id = ? AND assignee_id = ?`,
                            [requestId, req.user.id],
                            function (err) {
                                if (err) {
                                    console.error(err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Failed to update todo' });
                                }

                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        console.error(err);
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Transaction failed' });
                                    }

                                    res.json({ message: 'Request rejected' });
                                });
                            }
                        );
                    }
                );
            }
        });
    });
});

// Get open "anyone" requests for dashboard
app.get('/requests/open', authenticateToken, (req, res) => {
    const query = `
        SELECT
            r.id,
            r.shift_id,
            r.sender_id,
            r.status,
            s.date,
            s.time,
            u.username AS sender_name
        FROM requests r
        JOIN shifts s ON r.shift_id = s.id
        JOIN users u ON r.sender_id = u.id
        WHERE
            r.request_type = 'anyone'
            AND r.status = 'open'
            AND r.sender_id != ?
    `;

    db.all(query, [req.user.id], (err, rows) => {
        if (err) {
            console.error('Error fetching open requests:', err);
            return res.status(500).json({ error: 'Database error' });
        }

        res.json(rows);
    });
});

// Claim an "anyone" request (first come first serve)
app.put('/requests/:id/claim', authenticateToken, (req, res) => {
    const requestId = req.params.id;

    // 先检查 request 状态
    db.get(
        `SELECT * FROM requests WHERE id = ?`,
        [requestId],
        (err, request) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!request) {
                return res.status(404).json({ error: 'Request not found' });
            }

            if (request.request_type !== 'anyone') {
                return res.status(400).json({ error: 'Not an open request' });
            }

            if (request.status !== 'open') {
                return res.status(400).json({ error: 'Already claimed or closed' });
            }

            if (request.sender_id === req.user.id) {
                return res.status(403).json({ error: 'Cannot claim your own request' });
            }

            // 抢班（更新 candidate）
            db.run(
                `UPDATE requests
                 SET candidate_id = ?, status = 'pending_admin'
                 WHERE id = ? AND status = 'open'`,
                [req.user.id, requestId],
                function (err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Failed to claim request' });
                    }

                    if (this.changes === 0) {
                        return res.status(400).json({ error: 'Already taken by someone else' });
                    }

                    res.json({ message: 'Request claimed, waiting for admin approval' });
                }
            );
        }
    );
});

// Employee applies for an available shift
app.put('/shifts/:id/apply', authenticateToken, (req, res) => {
    const shiftId = req.params.id;

    db.get(`SELECT * FROM shifts WHERE id = ?`, [shiftId], (err, shift) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }

        if (!shift) {
            return res.status(404).json({ error: 'Shift not found' });
        }

        if (shift.status !== 'available') {
            return res.status(400).json({ error: 'This shift is not available' });
        }

        db.get(
            `SELECT * FROM requests
             WHERE shift_id = ? AND status IN ('pending_admin', 'approved')`,
            [shiftId],
            (err, existing) => {
                if (err) {
                    console.error(err);
                    return res.status(500).json({ error: 'Database error' });
                }

                if (existing) {
                    return res.status(400).json({ error: 'This shift has already been applied for' });
                }

                db.get(`SELECT id FROM users WHERE username = 'admin'`, [], (err, adminUser) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: 'Database error' });
                    }

                    if (!adminUser) {
                        return res.status(500).json({ error: 'Admin user not found' });
                    }

                    db.serialize(() => {
                        db.run('BEGIN TRANSACTION');

                        db.run(
                            `INSERT INTO requests
                             (shift_id, sender_id, receiver_id, candidate_id, request_type, status)
                             VALUES (?, ?, NULL, ?, 'anyone', 'pending_admin')`,
                            [shiftId, adminUser.id, req.user.id],
                            function (err) {
                                if (err) {
                                    console.error(err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Failed to apply for shift' });
                                }

                                db.run(
                                    `UPDATE shifts
                                     SET status = 'pending_admin'
                                     WHERE id = ?`,
                                    [shiftId],
                                    function (err) {
                                        if (err) {
                                            console.error(err);
                                            db.run('ROLLBACK');
                                            return res.status(500).json({ error: 'Failed to update shift status' });
                                        }

                                        db.run('COMMIT', (err) => {
                                            if (err) {
                                                console.error(err);
                                                db.run('ROLLBACK');
                                                return res.status(500).json({ error: 'Transaction failed' });
                                            }

                                            res.json({ message: 'Applied successfully. Waiting for admin approval.' });
                                        });
                                    }
                                );
                            }
                        );
                    });
                });
            }
        );
    });
});

// Cancel a request (only sender can cancel before it is claimed/responded)
app.put('/requests/:id/cancel', authenticateToken, (req, res) => {
    const requestId = req.params.id;

    db.get(
        `SELECT * FROM requests WHERE id = ?`,
        [requestId],
        (err, request) => {
            if (err) {
                console.error('Error finding request:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!request) {
                return res.status(404).json({ error: 'Request not found' });
            }

            const isSenderCancel =
                request.sender_id === req.user.id &&
                ['open', 'waiting_response'].includes(request.status);

            const isCandidateWithdraw =
                request.candidate_id === req.user.id &&
                request.status === 'pending_admin';

            if (!isSenderCancel && !isCandidateWithdraw) {
                return res.status(403).json({ error: 'Not allowed to cancel this request' });
            }

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                db.run(
                    `UPDATE requests
                     SET status = 'cancelled'
                     WHERE id = ?`,
                    [requestId],
                    function (err) {
                        if (err) {
                            console.error('Error cancelling request:', err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to cancel request' });
                        }

                        db.run(
                            `UPDATE shifts
                             SET status = 'available'
                             WHERE id = ?`,
                            [request.shift_id],
                            function (err) {
                                if (err) {
                                    console.error('Error restoring shift:', err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Failed to restore shift' });
                                }

                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        console.error(err);
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Transaction failed' });
                                    }

                                    res.json({ message: 'Request cancelled successfully' });
                                });
                            }
                        );
                    }
                );
            });
        }
    );
});

// Admin decision on a request
app.put('/requests/:id/admin-decision', authenticateToken, requireAdmin, (req, res) => {
    const requestId = req.params.id;
    const { action } = req.body; // approve / reject

    if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
    }

    db.get(
        `SELECT * FROM requests WHERE id = ?`,
        [requestId],
        (err, request) => {
            if (err) {
                console.error('Error finding request:', err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!request) {
                return res.status(404).json({ error: 'Request not found' });
            }

            if (request.status !== 'pending_admin') {
                return res.status(400).json({ error: 'Only pending_admin requests can be reviewed' });
            }

        if (action === 'reject') {
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                db.run(
                    `UPDATE requests
                     SET status = 'rejected'
                     WHERE id = ?`,
                    [requestId],
                    function (err) {
                        if (err) {
                            console.error('Error rejecting request:', err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to reject request' });
                        }

                        db.run(
                            `UPDATE shifts
                             SET status = 'available'
                             WHERE id = ?`,
                            [request.shift_id],
                            function (err) {
                                if (err) {
                                    console.error('Error restoring shift status:', err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Failed to restore shift status' });
                                }

                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        console.error('Commit failed:', err);
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Transaction failed' });
                                    }

                                    res.json({ message: 'Request rejected' });
                                });
                            }
                        );
                    }
                );
            });
            return;
        }

            // approve
            if (!request.candidate_id) {
                return res.status(400).json({ error: 'No candidate selected for this request' });
            }

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                db.run(
                    `UPDATE shifts
                     SET user_id = ?, status = 'assigned'
                     WHERE id = ?`,
                    [request.candidate_id, request.shift_id],
                    function (err) {
                        if (err) {
                            console.error('Error updating shift owner:', err);
                            db.run('ROLLBACK');
                            return res.status(500).json({ error: 'Failed to update shift' });
                        }

                        db.run(
                            `UPDATE requests
                             SET status = 'approved'
                             WHERE id = ?`,
                            [requestId],
                            function (err) {
                                if (err) {
                                    console.error('Error approving request:', err);
                                    db.run('ROLLBACK');
                                    return res.status(500).json({ error: 'Failed to approve request' });
                                }

                                db.run('COMMIT', (err) => {
                                    if (err) {
                                        console.error('Commit failed:', err);
                                        db.run('ROLLBACK');
                                        return res.status(500).json({ error: 'Transaction failed' });
                                    }

                                    res.json({ message: 'Request approved and shift transferred' });
                                });
                            }
                        );
                    }
                );
            });
        }
    );
});

// 8. 获取当前用户的 Todos API
app.get('/todos', authenticateToken, (req, res) => {
    const query = `
        SELECT
            t.*,
            r.status AS request_status,
            r.request_type,
            assigner.username AS assigner_name,
            assignee.username AS assignee_name
        FROM todos t
        LEFT JOIN requests r ON t.request_id = r.id
        LEFT JOIN users assigner ON t.assigner_id = assigner.id
        LEFT JOIN users assignee ON t.assignee_id = assignee.id
        WHERE t.assignee_id = ? OR (t.assignee_id IS NULL AND t.assigner_id = ?) OR t.assigner_id = ?
        ORDER BY t.id DESC
    `;
    db.all(query, [req.user.id, req.user.id, req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: '数据库错误' });

        const formatted = rows.map(t => ({
            id: t.id,
            text: t.text,
            completed: t.completed === 1,
            request_id: t.request_id || null,
            request_status: t.request_status || null,
            request_type: t.request_type || null,
            assigner: t.assigner_id === req.user.id ? 'Self' : t.assigner_name,
            assignee: t.assignee_id === req.user.id ? 'Self' : t.assignee_name
        }));

        res.json(formatted);
    });
});

// 9. 添加新的 Todo API
app.post('/todos', authenticateToken, (req, res) => {
    const { text, assignee_id } = req.body;
    if (!text) return res.status(400).json({ error: '缺漏必填字段' });

    const finalAssignee = assignee_id ? assignee_id : req.user.id;

    const stmt = db.prepare('INSERT INTO todos (assigner_id, assignee_id, text, completed) VALUES (?, ?, ?, 0)');
    stmt.run([req.user.id, finalAssignee, text], function (err) {
        if (err) return res.status(500).json({ error: '保存任务失败' });
        res.status(201).json({ message: 'Todo added successfully', id: this.lastID });
    });
    stmt.finalize();
});

// 10. 更新 Todo 状态 API (Toggle completed)
app.put('/todos/:id', authenticateToken, (req, res) => {
    const { completed } = req.body;
    const todoId = req.params.id;

    db.get(
        `SELECT * FROM todos WHERE id = ?`,
        [todoId],
        (err, todo) => {
            if (err) {
                console.error(err);
                return res.status(500).json({ error: 'Database error' });
            }

            if (!todo) {
                return res.status(404).json({ error: 'Todo not found' });
            }

            // 只能由被分配的人处理这条 todo
            if (todo.assignee_id !== req.user.id) {
                return res.status(403).json({ error: 'Not allowed to update this todo' });
            }

            db.run(
                `UPDATE todos SET completed = ? WHERE id = ?`,
                [completed ? 1 : 0, todoId],
                function (err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({ error: '更新失败' });
                    }

                    res.json({ message: 'Todo status updated' });
                }
            );
        }
    );
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});

process.on('SIGINT', () => {
    db.close(() => {
        console.log('数据库连接已关闭。');
        process.exit(0);
    });
});
