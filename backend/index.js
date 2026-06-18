const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const mongoose = require("mongoose");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://swethakousi1996_db_user:Maximum8@cluster0.5yy3wpl.mongodb.net/?appName=Cluster0";
const RESERVATION_MINUTES = 10;

const frontendDistPath = path.join(__dirname, "../frontend/dist");

app.use(cors());
app.use(express.json());

const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true },
    venue: { type: String, required: true, trim: true },
    totalSeats: { type: Number, required: true, min: 1 }
  },
  { timestamps: true }
);

const seatSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    seatNumber: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["available", "reserved", "booked"],
      default: "available",
      index: true
    },
    reservedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation", default: null },
    reservedUntil: { type: Date, default: null }
  },
  { timestamps: true }
);
seatSchema.index({ eventId: 1, seatNumber: 1 }, { unique: true });

const reservationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true, index: true },
    seatNumbers: [{ type: String, required: true }],
    expiresAt: { type: Date, required: true, index: true },
    status: { type: String, enum: ["active", "booked", "expired"], default: "active" }
  },
  { timestamps: true }
);

const bookingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    seatNumbers: [{ type: String, required: true }],
    reservationId: { type: mongoose.Schema.Types.ObjectId, ref: "Reservation", required: true, unique: true }
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true }
  },
  { timestamps: true }
);

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    token: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: true }
  },
  { timestamps: true }
);

const Event = mongoose.model("Event", eventSchema);
const Seat = mongoose.model("Seat", seatSchema);
const Reservation = mongoose.model("Reservation", reservationSchema);
const Booking = mongoose.model("Booking", bookingSchema);
const User = mongoose.model("User", userSchema);
const Session = mongoose.model("Session", sessionSchema);

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function isPasswordValid(password, storedPassword) {
  const [salt, originalHash] = storedPassword.split(":");
  const testHash = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(originalHash, "hex"), Buffer.from(testHash, "hex"));
}

function userPayload(user) {
  return { id: user._id, name: user.name, email: user.email };
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function authRequired(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

    if (!token) {
      return res.status(401).json({ error: "Login required" });
    }

    const session = await Session.findOne({ token, expiresAt: { $gt: new Date() } }).populate("userId");

    if (!session || !session.userId) {
      return res.status(401).json({ error: "Session expired. Please login again." });
    }

    req.user = session.userId;
    req.token = token;
    next();
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await Session.create({ userId, token, expiresAt });
  return token;
}

async function releaseExpiredReservations() {
  const now = new Date();
  const expired = await Reservation.find({ status: "active", expiresAt: { $lte: now } }).select("_id");
  const expiredIds = expired.map(item => item._id);

  if (!expiredIds.length) return;

  await Reservation.updateMany({ _id: { $in: expiredIds } }, { $set: { status: "expired" } });
  await Seat.updateMany(
    { reservationId: { $in: expiredIds }, status: "reserved" },
    {
      $set: { status: "available", reservedBy: null, reservationId: null, reservedUntil: null }
    }
  );
}

async function seedEvents() {
  const sampleEventData = [
    {
      name: "React Summit Live",
      startsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      venue: "Orion Convention Centre",
      totalSeats: 48
    },
    {
      name: "Node Nights Concert",
      startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      venue: "Skyline Arena",
      totalSeats: 60
    },
    {
      name: "MongoDB Tech Forum",
      startsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      venue: "Innovation Hall",
      totalSeats: 36
    },
    {
      name: "AI Innovation Expo",
      startsAt: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
      venue: "Nexus Exhibition Grounds",
      totalSeats: 72
    },
    {
      name: "Startup Pitch Fest",
      startsAt: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
      venue: "Founders Hub Auditorium",
      totalSeats: 42
    },
    {
      name: "Indie Music Carnival",
      startsAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
      venue: "Riverfront Amphitheatre",
      totalSeats: 84
    },
    {
      name: "Cloud Computing Bootcamp",
      startsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      venue: "Tech Park Learning Centre",
      totalSeats: 54
    },
    {
      name: "Design Systems Workshop",
      startsAt: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
      venue: "Creative Studio Hall",
      totalSeats: 40
    },
    {
      name: "Cybersecurity Summit",
      startsAt: new Date(Date.now() + 42 * 24 * 60 * 60 * 1000),
      venue: "SecureNet Conference Hall",
      totalSeats: 66
    },
    {
      name: "Data Science Meetup",
      startsAt: new Date(Date.now() + 49 * 24 * 60 * 60 * 1000),
      venue: "Analytics Arena",
      totalSeats: 50
    }
  ];

  const currentEventCount = await Event.countDocuments();
  const eventSlotsAvailable = Math.max(0, 10 - currentEventCount);
  if (!eventSlotsAvailable) return;

  const existingEvents = await Event.find({ name: { $in: sampleEventData.map(event => event.name) } }).select("name");
  const existingNames = new Set(existingEvents.map(event => event.name));
  const eventsToCreate = sampleEventData
    .filter(event => !existingNames.has(event.name))
    .slice(0, eventSlotsAvailable);
  if (!eventsToCreate.length) return;

  const sampleEvents = await Event.insertMany(eventsToCreate);

  const seats = [];
  sampleEvents.forEach(event => {
    for (let i = 1; i <= event.totalSeats; i += 1) {
      const row = String.fromCharCode(64 + Math.ceil(i / 12));
      const number = ((i - 1) % 12) + 1;
      seats.push({ eventId: event._id, seatNumber: `${row}${number}` });
    }
  });

  await Seat.insertMany(seats);
}

app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const user = await User.create({ name, email, passwordHash: hashPassword(password) });
    const token = await createSession(user._id);

    res.status(201).json({ token, user: userPayload(user) });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !isPasswordValid(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = await createSession(user._id);
    res.json({ token, user: userPayload(user) });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ user: userPayload(req.user) });
});

app.post("/api/auth/logout", authRequired, async (req, res) => {
  await Session.deleteOne({ token: req.token });
  res.json({ message: "Logged out" });
});

app.get("/api/events", async (_req, res) => {
  try {
    await releaseExpiredReservations();
    const events = await Event.find().sort({ startsAt: 1 });
    const eventIds = events.map(event => event._id);
    const seatStats = await Seat.aggregate([
      { $match: { eventId: { $in: eventIds } } },
      { $group: { _id: { eventId: "$eventId", status: "$status" }, count: { $sum: 1 } } }
    ]);

    const statsByEvent = seatStats.reduce((acc, item) => {
      const eventId = String(item._id.eventId);
      acc[eventId] = acc[eventId] || { available: 0, reserved: 0, booked: 0 };
      acc[eventId][item._id.status] = item.count;
      return acc;
    }, {});

    res.json(events.map(event => ({
      id: event._id,
      name: event.name,
      startsAt: event.startsAt,
      venue: event.venue,
      totalSeats: event.totalSeats,
      seatStats: statsByEvent[String(event._id)] || { available: 0, reserved: 0, booked: 0 }
    })));
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get("/api/events/:id", async (req, res) => {
  try {
    if (!isObjectId(req.params.id)) {
      return res.status(400).json({ error: "Invalid event id" });
    }

    await releaseExpiredReservations();
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const seats = await Seat.find({ eventId: event._id }).sort({ seatNumber: 1 });

    res.json({
      id: event._id,
      name: event.name,
      startsAt: event.startsAt,
      venue: event.venue,
      totalSeats: event.totalSeats,
      seats: seats.map(seat => ({
        seatNumber: seat.seatNumber,
        status: seat.status,
        reservedUntil: seat.reservedUntil
      }))
    });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post("/api/reserve", authRequired, async (req, res) => {
  try {
    const { eventId, seatNumbers } = req.body;

    if (!isObjectId(eventId) || !Array.isArray(seatNumbers) || seatNumbers.length === 0) {
      return res.status(400).json({ error: "eventId and at least one seat number are required" });
    }

    const normalizedSeats = [...new Set(seatNumbers.map(seat => String(seat).trim().toUpperCase()))];
    if (normalizedSeats.length > 8) {
      return res.status(400).json({ error: "You can reserve up to 8 seats at a time" });
    }

    await releaseExpiredReservations();

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);
    const reservation = await Reservation.create({
      userId: req.user._id,
      eventId,
      seatNumbers: normalizedSeats,
      expiresAt
    });

    const result = await Seat.updateMany(
      { eventId, seatNumber: { $in: normalizedSeats }, status: "available" },
      {
        $set: {
          status: "reserved",
          reservedBy: req.user._id,
          reservationId: reservation._id,
          reservedUntil: expiresAt
        }
      }
    );

    if (result.modifiedCount !== normalizedSeats.length) {
      await Seat.updateMany(
        { reservationId: reservation._id, status: "reserved" },
        { $set: { status: "available", reservedBy: null, reservationId: null, reservedUntil: null } }
      );
      await Reservation.deleteOne({ _id: reservation._id });
      return res.status(409).json({ error: "One or more seats are no longer available" });
    }

    res.status(201).json({
      reservationId: reservation._id,
      eventId,
      seatNumbers: reservation.seatNumbers,
      expiresAt: reservation.expiresAt
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) });
  }
});

app.post("/api/bookings", authRequired, async (req, res) => {
  try {
    const { reservationId } = req.body;

    if (!isObjectId(reservationId)) {
      return res.status(400).json({ error: "Valid reservationId is required" });
    }

    const reservation = await Reservation.findOne({
      _id: reservationId,
      userId: req.user._id,
      status: "active"
    });

    if (!reservation) {
      return res.status(404).json({ error: "Reservation not found or already used" });
    }

    if (reservation.expiresAt <= new Date()) {
      await Reservation.updateOne({ _id: reservation._id }, { $set: { status: "expired" } });
      await Seat.updateMany(
        { reservationId: reservation._id, status: "reserved" },
        { $set: { status: "available", reservedBy: null, reservationId: null, reservedUntil: null } }
      );
      return res.status(409).json({ error: "Reservation expired. Please reserve seats again." });
    }

    const result = await Seat.updateMany(
      {
        eventId: reservation.eventId,
        seatNumber: { $in: reservation.seatNumbers },
        status: "reserved",
        reservationId: reservation._id,
        reservedBy: req.user._id
      },
      { $set: { status: "booked", reservedUntil: null } }
    );

    if (result.modifiedCount !== reservation.seatNumbers.length) {
      return res.status(409).json({ error: "Seats changed before booking could be confirmed" });
    }

    const booking = await Booking.create({
      userId: req.user._id,
      eventId: reservation.eventId,
      seatNumbers: reservation.seatNumbers,
      reservationId: reservation._id
    });
    await Reservation.deleteOne({ _id: reservation._id });

    res.status(201).json({
      bookingId: booking._id,
      eventId: booking.eventId,
      seatNumbers: booking.seatNumbers,
      message: "Booking confirmed"
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: String(err.message || err) });
  }
});

app.use(express.static(frontendDistPath));

app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDistPath, "index.html"));
});

async function start() {
  try {
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await seedEvents();
    setInterval(releaseExpiredReservations, 60 * 1000);
    app.listen(PORT, () => console.log(`server running on port ${PORT}`));
  } catch (err) {
    console.error("server failed to start", err);
    process.exit(1);
  }
}

start();
