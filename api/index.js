const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcrypt");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Database connection
const db = mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "StockDB",
});

db.connect(err => {
  if (err) {
    console.error("❌ MySQL Connection Failed:", err.message);
    process.exit(1);
  } else {
    console.log("✅ Connected to MySQL Database");
    ensureTablesExist(); // Ensure all required tables exist
  }
});

// 🧱 Ensure required tables exist (auto-recreate if deleted)
const ensureTablesExist = () => {
  db.query(`
    CREATE TABLE IF NOT EXISTS user_auth (
      username VARCHAR(100) PRIMARY KEY,
      password VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, err => {
    if (err) console.error("Error recreating user_auth:", err.message);
  });

  db.query(`
    CREATE TABLE IF NOT EXISTS account_totals (
      username VARCHAR(100) PRIMARY KEY,
      total FLOAT DEFAULT 0,
      FOREIGN KEY (username) REFERENCES user_auth(username) ON DELETE CASCADE
    )
  `, err => {
    if (err) console.error("Error recreating account_totals:", err.message);
  });
};

// Helper function to get current balance
const getCurrentBalance = (username, callback) => {
  db.query(
    `SELECT total FROM account_totals WHERE username = ?`,
    [username],
    (err, results) => {
      if (err) return callback(err);
      callback(null, results[0]?.total || 0);
    }
  );
};

// Helper function to update account total
const updateTotal = (username, amount, action, callback) => {
  const change = ["sell", "invest"].includes(action) ? amount : -amount;
  
  db.query(
    `INSERT INTO account_totals (username, total)
     VALUES (?, ?) 
     ON DUPLICATE KEY UPDATE total = total + ?`,
    [username, change, change],
    err => {
      if (err) return callback(err);
      
      db.query(
        `SELECT total FROM account_totals WHERE username = ?`,
        [username],
        (err, results) => {
          if (err) return callback(err);
          callback(null, results[0]?.total || 0);
        }
      );
    }
  );
};

// Register route
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.json({ success: false, message: "Username and password required" });
  if (username.length < 3)
    return res.json({ success: false, message: "Username must be at least 3 characters" });
  if (password.length < 6)
    return res.json({ success: false, message: "Password must be at least 6 characters" });

  const userTable = mysql.escapeId(`portfolio_${username}`);
  ensureTablesExist(); // ensure base tables exist before registration

  db.query(`SELECT * FROM user_auth WHERE username = ?`, [username], (err, results) => {
    if (err && err.code === "ER_NO_SUCH_TABLE") {
      console.log("⚠️ Tables missing — recreating...");
      ensureTablesExist();
      return res.json({ success: false, message: "Tables recreated. Please register again." });
    }

    if (err) {
      console.error("Registration error:", err);
      return res.json({ success: false, message: "Registration failed" });
    }

    if (results.length > 0)
      return res.json({ success: false, message: "Username already exists" });

    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) {
        console.error("Password hashing error:", err);
        return res.json({ success: false, message: "Registration failed" });
      }

      db.query(
        `INSERT INTO user_auth (username, password) VALUES (?, ?)`,
        [username, hashedPassword],
        (err) => {
          if (err) {
            console.error("User creation error:", err);
            return res.json({ success: false, message: "Registration failed" });
          }

          // Create user's portfolio table if deleted or missing
          db.query(
            `CREATE TABLE IF NOT EXISTS ${userTable} (
              id INT AUTO_INCREMENT PRIMARY KEY,
              date DATE NOT NULL,
              stock VARCHAR(100),
              action VARCHAR(50) NOT NULL,
              amount FLOAT NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,
            (err) => {
              if (err) {
                console.error("Portfolio table creation error:", err);
                return res.json({ success: false, message: "Registration failed" });
              }

              // Initialize account total if missing
              db.query(
                `INSERT INTO account_totals (username, total)
                 VALUES (?, 0)
                 ON DUPLICATE KEY UPDATE total = total`,
                [username],
                (err) => {
                  if (err) {
                    console.error("Account total initialization error:", err);
                    return res.json({ success: false, message: "Registration failed" });
                  }

                  res.json({ success: true, message: "Registration successful! Please log in." });
                }
              );
            }
          );
        }
      );
    });
  });
});

// Login route
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password)
    return res.json({ success: false, message: "Username and password required" });

  const userTable = mysql.escapeId(`portfolio_${username}`);
  ensureTablesExist(); // ensure tables exist before login

  db.query(`SELECT * FROM user_auth WHERE username = ?`, [username], (err, results) => {
    if (err) {
      console.error("Login error:", err);
      ensureTablesExist();
      return res.json({ success: false, message: "Login failed. Tables recreated." });
    }

    if (results.length === 0)
      return res.json({ success: false, message: "Invalid username or password" });

    bcrypt.compare(password, results[0].password, (err, isMatch) => {
      if (err || !isMatch)
        return res.json({ success: false, message: "Invalid username or password" });

      // Make sure user's portfolio exists even if deleted
      db.query(
        `CREATE TABLE IF NOT EXISTS ${userTable} (
          id INT AUTO_INCREMENT PRIMARY KEY,
          date DATE NOT NULL,
          stock VARCHAR(100),
          action VARCHAR(50) NOT NULL,
          amount FLOAT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        (err) => {
          if (err) {
            console.error("Portfolio recreation error:", err);
            return res.json({ success: false, message: "Login failed" });
          }

          db.query(`SELECT * FROM ${userTable} ORDER BY date DESC, created_at DESC`, (err, portfolio) => {
            if (err) {
              console.error("Portfolio fetch error:", err);
              return res.json({ success: false, message: "Login failed" });
            }

            db.query(`SELECT total FROM account_totals WHERE username = ?`, [username], (err, totals) => {
              if (err) {
                console.error("Account total fetch error:", err);
                return res.json({ success: false, message: "Login failed" });
              }

              res.json({
                success: true,
                username,
                portfolio,
                totalBalance: totals[0]?.total || 0,
              });
            });
          });
        }
      );
    });
  });
});

// Helper function to check stock ownership
const getStockQuantity = (username, stockSymbol, callback) => {
  const userTable = mysql.escapeId(`portfolio_${username}`);
  
  db.query(
    `SELECT 
      SUM(CASE WHEN action = 'buy' THEN amount ELSE 0 END) as bought,
      SUM(CASE WHEN action = 'sell' THEN amount ELSE 0 END) as sold
    FROM ${userTable} 
    WHERE LOWER(stock) = LOWER(?)`,
    [stockSymbol],
    (err, results) => {
      if (err) return callback(err);
      const bought = results[0]?.bought || 0;
      const sold = results[0]?.sold || 0;
      callback(null, bought - sold);
    }
  );
};

// Trade route
app.post("/api/trade", (req, res) => {
  const { date, stock, amount, action, user } = req.body;

  if (!date || !amount || !action || !user)
    return res.json({ success: false, message: "Missing required fields" });

  const value = parseFloat(amount);
  if (isNaN(value) || value <= 0)
    return res.json({ success: false, message: "Invalid amount" });

  if (!["buy", "sell", "invest", "withdraw"].includes(action))
    return res.json({ success: false, message: "Invalid action" });

  const userTable = mysql.escapeId(`portfolio_${user}`);
  ensureTablesExist();

  // Ensure user's portfolio table exists before trade
  db.query(
    `CREATE TABLE IF NOT EXISTS ${userTable} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      date DATE NOT NULL,
      stock VARCHAR(100),
      action VARCHAR(50) NOT NULL,
      amount FLOAT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );

  if (action === "sell") {
    getStockQuantity(user, stock, (err, availableStock) => {
      if (err) return res.json({ success: false, message: "Transaction failed" });
      if (availableStock <= 0)
        return res.json({ success: false, message: `You don't own any ${stock.toUpperCase()} stock!` });
      if (value > availableStock)
        return res.json({ success: false, message: `Insufficient stock! You only have ${availableStock}` });
      executeTransaction();
    });
  } else if (action === "buy" || action === "withdraw") {
    getCurrentBalance(user, (err, balance) => {
      if (err) return res.json({ success: false, message: "Transaction failed" });
      if (value > balance)
        return res.json({ success: false, message: `Insufficient balance! You only have ${balance}` });
      executeTransaction();
    });
  } else executeTransaction();

  function executeTransaction() {
    db.query(
      `INSERT INTO ${userTable} (date, stock, action, amount) VALUES (?, ?, ?, ?)`,
      [date, stock || null, action, value],
      (err) => {
        if (err) return res.json({ success: false, message: "Trade failed" });
        updateTotal(user, value, action, (err, newTotal) => {
          if (err) return res.json({ success: false, message: "Trade failed" });
          db.query(`SELECT * FROM ${userTable} ORDER BY date DESC, created_at DESC`, (err, portfolio) => {
            if (err) return res.json({ success: false, message: "Trade failed" });
            res.json({ success: true, portfolio, totalBalance: newTotal });
          });
        });
      }
    );
  }
});

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
