const express = require("express");
const fs = require("fs");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const DATA_DIR = process.env.RENDER_DISK_MOUNT_PATH || "/data";
const USERS_FILE = path.join(DATA_DIR, "users.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "{}");
}

let users = {};

try {
  users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
} catch {
  users = {};
}

function saveUsers() {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function defaultPlayerData() {
  return {
    hp: 100,
    maxHp: 100,
    melee: 1,
    distance: 1,
    magic: 1,
    defense: 1,
    gold: 0,
    xp: 0,
    inventory: {}
  };
}

function findUserByEmail(email) {
  const lower = String(email || "").trim().toLowerCase();
  for (const [username, user] of Object.entries(users)) {
    if ((user.email || "").toLowerCase() === lower) {
      return { username, user };
    }
  }
  return null;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false") === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

app.post("/register", async (req, res) => {
  try {
    const { username, password, email } = req.body || {};

    if (!username || !password || !email) {
      return res.status(400).send("Missing username, password, or email");
    }

    if (users[username]) {
      return res.send("User exists");
    }

    if (findUserByEmail(email)) {
      return res.send("Email already in use");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    users[username] = {
      email: String(email).trim().toLowerCase(),
      password: hashedPassword,
      resetToken: null,
      resetTokenExpires: null,
      data: defaultPlayerData()
    };

    saveUsers();
    res.send("Registered");
  } catch (err) {
    console.error(err);
    res.status(500).send("Register failed");
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = users[username];

    if (!user) {
      return res.json({ success: false });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.json({ success: false });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
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

app.get("/leaderboard", (req, res) => {
  try {
    const leaderboard = Object.entries(users)
      .map(([username, user]) => ({
        username,
        gold: Number(user?.data?.gold || 0),
        melee: Number(user?.data?.melee || 0),
        distance: Number(user?.data?.distance || 0),
        magic: Number(user?.data?.magic || 0),
        defense: Number(user?.data?.defense || 0),
        xp: Number(user?.data?.xp || 0)
      }))
      .sort((a, b) => {
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.melee !== a.melee) return b.melee - a.melee;
        return b.xp - a.xp;
      })
      .slice(0, 10);

    res.json(leaderboard);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    const found = findUserByEmail(email);
    const genericMessage = "If that email exists, a reset link was sent.";

    if (!found) {
      return res.send(genericMessage);
    }

    const token = crypto.randomBytes(32).toString("hex");
    found.user.resetToken = token;
    found.user.resetTokenExpires = Date.now() + 1000 * 60 * 60;
    saveUsers();

    const baseUrl = process.env.BASE_URL || "https://draythonline.com";
    const resetLink = `${baseUrl}/reset.html?token=${token}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: found.user.email,
      subject: "Drayth Online Password Reset",
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2>Drayth Online</h2>
          <p>Click below to reset your password:</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>This link expires in 1 hour.</p>
        </div>
      `
    });

    res.send(genericMessage);
  } catch (err) {
    console.error(err);
    res.status(500).send("Could not send reset email");
  }
});

app.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || !newPassword) {
      return res.status(400).send("Missing token or password");
    }

    let matchedUser = null;

    for (const [username, user] of Object.entries(users)) {
      if (
        user.resetToken === token &&
        user.resetTokenExpires &&
        Date.now() < user.resetTokenExpires
      ) {
        matchedUser = { username, user };
        break;
      }
    }

    if (!matchedUser) {
      return res.status(400).send("Invalid or expired token");
    }

    matchedUser.user.password = await bcrypt.hash(newPassword, 10);
    matchedUser.user.resetToken = null;
    matchedUser.user.resetTokenExpires = null;
    saveUsers();

    res.send("Password reset successful");
  } catch (err) {
    console.error(err);
    res.status(500).send("Reset failed");
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/forgot.html", (req, res) => {
  res.sendFile(path.join(__dirname, "forgot.html"));
});

app.get("/reset.html", (req, res) => {
  res.sendFile(path.join(__dirname, "reset.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using users file: ${USERS_FILE}`);
});}

function defaultPlayerData() {
  return {
    hp: 100,
    maxHp: 100,
    melee: 1,
    distance: 1,
    magic: 1,
    defense: 1,
    gold: 0,
    xp: 0,
    inventory: {}
  };
}

function findUserByEmail(email) {
  const lower = String(email || "").trim().toLowerCase();
  for (const [username, user] of Object.entries(users)) {
    if ((user.email || "").toLowerCase() === lower) {
      return { username, user };
    }
  }
  return null;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || "false") === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

app.post("/register", async (req, res) => {
  try {
    const { username, password, email } = req.body || {};

    if (!username || !password || !email) {
      return res.status(400).send("Missing username, password, or email");
    }

    if (users[username]) {
      return res.send("User exists");
    }

    if (findUserByEmail(email)) {
      return res.send("Email already in use");
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    users[username] = {
      email: String(email).trim().toLowerCase(),
      password: hashedPassword,
      resetToken: null,
      resetTokenExpires: null,
      data: defaultPlayerData()
    };

    saveUsers();
    res.send("Registered");
  } catch (err) {
    console.error(err);
    res.status(500).send("Register failed");
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const user = users[username];

    if (!user) {
      return res.json({ success: false });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.json({ success: false });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.json({ success: false });
  }
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

app.get("/leaderboard", (req, res) => {
  try {
    const leaderboard = Object.entries(users)
      .map(([username, user]) => ({
        username,
        gold: user?.data?.gold || 0,
        xp: user?.data?.xp || 0,
        melee: user?.data?.melee || 0,
        distance: user?.data?.distance || 0,
        magic: user?.data?.magic || 0,
        defense: user?.data?.defense || 0
      }))
      .sort((a, b) => {
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.xp !== a.xp) return b.xp - a.xp;
        return b.melee - a.melee;
      })
      .slice(0, 10);

    res.json(leaderboard);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    const found = findUserByEmail(email);
    const genericMessage = "If that email exists, a reset link was sent.";

    if (!found) {
      return res.send(genericMessage);
    }

    const token = crypto.randomBytes(32).toString("hex");
    found.user.resetToken = token;
    found.user.resetTokenExpires = Date.now() + 1000 * 60 * 60;
    saveUsers();

    const baseUrl = process.env.BASE_URL || "https://draythonline.com";
    const resetLink = `${baseUrl}/reset.html?token=${token}`;

    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: found.user.email,
      subject: "Drayth Online Password Reset",
      html: `
        <div style="font-family:Arial,sans-serif">
          <h2>Drayth Online</h2>
          <p>Click below to reset your password:</p>
          <p><a href="${resetLink}">${resetLink}</a></p>
          <p>This link expires in 1 hour.</p>
        </div>
      `
    });

    res.send(genericMessage);
  } catch (err) {
    console.error(err);
    res.status(500).send("Could not send reset email");
  }
});

app.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token || !newPassword) {
      return res.status(400).send("Missing token or password");
    }

    let matchedUser = null;

    for (const [username, user] of Object.entries(users)) {
      if (
        user.resetToken === token &&
        user.resetTokenExpires &&
        Date.now() < user.resetTokenExpires
      ) {
        matchedUser = { username, user };
        break;
      }
    }

    if (!matchedUser) {
      return res.status(400).send("Invalid or expired token");
    }

    matchedUser.user.password = await bcrypt.hash(newPassword, 10);
    matchedUser.user.resetToken = null;
    matchedUser.user.resetTokenExpires = null;
    saveUsers();

    res.send("Password reset successful");
  } catch (err) {
    console.error(err);
    res.status(500).send("Reset failed");
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"));
});

app.get("/forgot.html", (req, res) => {
  res.sendFile(path.join(__dirname, "forgot.html"));
});

app.get("/reset.html", (req, res) => {
  res.sendFile(path.join(__dirname, "reset.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Using users file: ${USERS_FILE}`);
});
