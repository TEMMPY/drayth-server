const express = require("express");
const fs = require("fs");
const path = require("path");
const session = require("express-session");

const app = express();
const PORT = 3000;

// ✅ ONLY ONE USERS_FILE (this fixes your error)
const USERS_FILE = path.join(__dirname, "users.json");

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: "secretkey",
  resave: false,
  saveUninitialized: false
}));

app.use(express.static(__dirname));

// =======================
// USERS FUNCTIONS
// =======================
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, "[]");
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// =======================
// REGISTER
// =======================
app.post("/register", (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();

  if (!username || !password) {
    return res.send("Missing username or password");
  }

  const exists = users.find(u => u.username === username);
  if (exists) {
    return res.send("User already exists");
  }

  users.push({
    username,
    password,
    level: 1,
    xp: 0,
    gold: 0
  });

  saveUsers(users);
  res.redirect("/login.html");
});

// =======================
// LOGIN
// =======================
app.post("/login", (req, res) => {
  const { username, password } = req.body;
  const users = loadUsers();

  const user = users.find(
    u => u.username === username && u.password === password
  );

  if (!user) {
    return res.send("Invalid login");
  }

  req.session.username = user.username;
  res.redirect("/index.html");
});

// =======================
// CURRENT USER
// =======================
app.get("/me", (req, res) => {
  if (!req.session.username) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const users = loadUsers();
  const user = users.find(u => u.username === req.session.username);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(user);
});

// =======================
// LEADERBOARD
// =======================
app.get("/leaderboard", (req, res) => {
  const users = loadUsers();

  const sorted = users.sort((a, b) => {
    if ((b.level || 0) !== (a.level || 0)) {
      return (b.level || 0) - (a.level || 0);
    }
    return (b.xp || 0) - (a.xp || 0);
  });

  res.json(sorted);
});

// =======================
// START SERVER
// =======================
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
