const express = require("express");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

let users = {};

if (fs.existsSync("users.json")) {
  try {
    users = JSON.parse(fs.readFileSync("users.json", "utf8"));
  } catch (e) {
    users = {};
  }
}

function saveUsers() {
  fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
}

app.post("/register", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).send("Missing username or password");
  }

  if (users[username]) {
    return res.send("User exists");
  }

  users[username] = {
    password,
    data: {
      hp: 100,
      maxHp: 100,
      melee: 1,
      gold: 0
    }
  };

  saveUsers();
  res.send("Registered");
});

app.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!users[username] || users[username].password !== password) {
    return res.json({ success: false });
  }

  res.json({ success: true });
});

app.post("/save", (req, res) => {
  const { username, data } = req.body || {};

  if (!username || !users[username]) {
    return res.status(400).send("No user");
  }

  users[username].data = data;
  saveUsers();
  res.send("Saved");
});

app.post("/load", (req, res) => {
  const { username } = req.body || {};

  if (!username || !users[username]) {
    return res.json({});
  }

  res.json(users[username].data);
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
