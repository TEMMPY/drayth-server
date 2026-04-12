const express = require("express");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

let users = {};

// load users
if (fs.existsSync("users.json")) {
  users = JSON.parse(fs.readFileSync("users.json"));
}

// REGISTER
app.post("/register", (req, res) => {
  const { username, password } = req.body;

  if (users[username]) return res.send("User exists");

  users[username] = {
    password,
    data: {
      hp: 100,
      maxHp: 100,
      melee: 1,
      gold: 0
    }
  };

  fs.writeFileSync("users.json", JSON.stringify(users));
  res.send("Registered");
});

// LOGIN
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!users[username] || users[username].password !== password) {
    return res.json({ success: false });
  }

  res.json({ success: true });
});

// SAVE GAME
app.post("/save", (req, res) => {
  const { username, data } = req.body;

  if (!users[username]) return res.send("No user");

  users[username].data = data;
  fs.writeFileSync("users.json", JSON.stringify(users));

  res.send("Saved");
});

// LOAD GAME
app.post("/load", (req, res) => {
  const { username } = req.body;

  if (!users[username]) return res.json({});

  res.json(users[username].data);
});

app.listen(3000, () => console.log("Server running on port 3000"));