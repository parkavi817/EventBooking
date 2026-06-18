import React, { useEffect, useMemo, useState } from "react";
import "./styles.css";

const API_URL = import.meta.env.VITE_API_URL || "/api";

const emptyAuthForm = {
  name: "",
  email: "",
  password: ""
};

function savedToken() {
  return localStorage.getItem("ticket-auth-token") || "";
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTimer(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function App() {
  const [token, setToken] = useState(savedToken);
  const [user, setUser] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(emptyAuthForm);
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [eventDetails, setEventDetails] = useState(null);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [reservation, setReservation] = useState(null);
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const canSubmitAuth = useMemo(() => {
    const base = authForm.email.trim() && authForm.password.trim();
    return authMode === "login" ? base : base && authForm.name.trim();
  }, [authForm, authMode]);

  const selectedEvent = useMemo(() => {
    return events.find(event => event.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  const reservationMsLeft = reservation ? new Date(reservation.expiresAt).getTime() - now : 0;
  const reservationExpired = reservation && reservationMsLeft <= 0;

  function authHeaders() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    };
  }

  function saveSession(nextToken, nextUser) {
    localStorage.setItem("ticket-auth-token", nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }

  function clearSession() {
    localStorage.removeItem("ticket-auth-token");
    setToken("");
    setUser(null);
    setReservation(null);
    setBooking(null);
    setSelectedSeats([]);
  }

  async function api(path, options = {}) {
    const res = await fetch(`${API_URL}${path}`, options);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Something went wrong");
    }

    return data;
  }

  async function loadEvents() {
    try {
      const data = await api("/events");
      setEvents(data);
      setSelectedEventId(current => current || data[0]?.id || "");
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadEventDetails(eventId = selectedEventId) {
    if (!eventId) return;

    try {
      const data = await api(`/events/${eventId}`);
      setEventDetails(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadCurrentUser() {
    if (!token) return;

    try {
      const data = await api("/auth/me", { headers: authHeaders() });
      setUser(data.user);
    } catch (err) {
      setError(err.message);
      clearSession();
    }
  }

  useEffect(() => {
    loadCurrentUser();
  }, [token]);

  useEffect(() => {
    if (user) {
      loadEvents();
    }
  }, [user]);

  useEffect(() => {
    setSelectedSeats([]);
    setReservation(null);
    setBooking(null);
    setNotice("");
    if (selectedEventId) {
      loadEventDetails(selectedEventId);
    }
  }, [selectedEventId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (reservationExpired) {
      setReservation(null);
      setSelectedSeats([]);
      setNotice("Reservation expired. Select seats again to continue.");
      loadEventDetails();
      loadEvents();
    }
  }, [reservationExpired]);

  function onAuthChange(event) {
    const { name, value } = event.target;
    setAuthForm(prev => ({ ...prev, [name]: value }));
  }

  async function onAuthSubmit(event) {
    event.preventDefault();

    if (!canSubmitAuth) {
      setError(authMode === "login" ? "Email and password are required" : "Name, email, and password are required");
      return;
    }

    try {
      setLoading(true);
      setError("");
      const body = authMode === "login"
        ? { email: authForm.email, password: authForm.password }
        : authForm;
      const data = await api(`/auth/${authMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      setAuthForm(emptyAuthForm);
      saveSession(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function onLogout() {
    if (token) {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        headers: authHeaders()
      }).catch(() => {});
    }

    clearSession();
  }

  function toggleSeat(seat) {
    if (seat.status !== "available" || reservation) return;

    setError("");
    setNotice("");
    setSelectedSeats(prev => {
      if (prev.includes(seat.seatNumber)) {
        return prev.filter(item => item !== seat.seatNumber);
      }

      return [...prev, seat.seatNumber];
    });
  }

  async function reserveSeats() {
    if (!selectedEventId || selectedSeats.length === 0) {
      setError("Select at least one available seat first");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setNotice("");
      const data = await api("/reserve", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ eventId: selectedEventId, seatNumbers: selectedSeats })
      });

      setReservation(data);
      setNotice("Seats reserved. Confirm before the timer reaches zero.");
      await loadEventDetails();
      await loadEvents();
    } catch (err) {
      setError(err.message);
      setSelectedSeats([]);
      await loadEventDetails();
      await loadEvents();
    } finally {
      setLoading(false);
    }
  }

  async function confirmBooking() {
    if (!reservation) return;

    try {
      setLoading(true);
      setError("");
      const data = await api("/bookings", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ reservationId: reservation.reservationId })
      });

      setBooking(data);
      setReservation(null);
      setSelectedSeats([]);
      setNotice("Booking confirmed. Your seats are locked in.");
      await loadEventDetails();
      await loadEvents();
    } catch (err) {
      setError(err.message);
      setReservation(null);
      await loadEventDetails();
      await loadEvents();
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-background">
          <div className="floating-shapes">
            <div className="shape shape-1"></div>
            <div className="shape shape-2"></div>
            <div className="shape shape-3"></div>
          </div>
        </div>
        <main className="auth-shell">
          <section className="auth-panel glass-card">
            <div className="auth-header">
              <div className="brand-icon">🎫</div>
              <p className="eyebrow">Event Ticket Booking</p>
              <h1>{authMode === "login" ? "Welcome back" : "Create your account"}</h1>
              <p className="muted">Reserve seats for live events and complete booking before the hold expires.</p>
            </div>

            {error && (
              <div className="alert error animate-slide-down">
                <span className="alert-icon">⚠️</span>
                {error}
              </div>
            )}

            <form className="auth-form" onSubmit={onAuthSubmit}>
              {authMode === "signup" && (
                <div className="form-group">
                  <label>Full Name</label>
                  <div className="input-wrapper">
                    <span className="input-icon">👤</span>
                    <input
                      name="name"
                      value={authForm.name}
                      onChange={onAuthChange}
                      placeholder="Aarav Mehta"
                      className="input-field"
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Email Address</label>
                <div className="input-wrapper">
                  <span className="input-icon">📧</span>
                  <input
                    type="email"
                    name="email"
                    value={authForm.email}
                    onChange={onAuthChange}
                    placeholder="you@example.com"
                    className="input-field"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Password</label>
                <div className="input-wrapper">
                  <span className="input-icon">🔒</span>
                  <input
                    type="password"
                    name="password"
                    value={authForm.password}
                    onChange={onAuthChange}
                    placeholder="At least 6 characters"
                    className="input-field"
                  />
                </div>
              </div>

              <button 
                className="primary-button pulse-on-hover" 
                disabled={!canSubmitAuth || loading}
              >
                {loading ? (
                  <span className="loading-spinner">⏳</span>
                ) : authMode === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>

            <button
              className="link-button"
              type="button"
              onClick={() => {
                setAuthMode(authMode === "login" ? "signup" : "login");
                setError("");
                setAuthForm(emptyAuthForm);
              }}
            >
              {authMode === "login" ? "Need an account? Sign up" : "Already registered? Login"}
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="topbar glass-nav">
        <div className="topbar-left">
          <div className="brand-icon-small">🎫</div>
          <div>
            <p className="eyebrow">Seat Reservation Console</p>
            <h1>Book event tickets</h1>
          </div>
        </div>
        <div className="topbar-right">
          <div className="user-chip glass-card">
            <span className="user-avatar">{user.name.charAt(0).toUpperCase()}</span>
            <span className="user-name">{user.name}</span>
            <button type="button" onClick={onLogout} className="logout-button">
              🚪 Logout
            </button>
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className="event-list glass-card">
          <div className="section-heading">
            <h2>🎪 Events</h2>
            <button className="ghost-button" type="button" onClick={loadEvents}>
              🔄 Refresh
            </button>
          </div>

          <div className="event-scroll">
            {events.map(event => (
              <button
                type="button"
                key={event.id}
                className={`event-card ${event.id === selectedEventId ? "active" : ""}`}
                onClick={() => setSelectedEventId(event.id)}
              >
                <div className="event-card-header">
                  <span className="event-title">{event.name}</span>
                  <span className="event-venue">{event.venue}</span>
                </div>
                <div className="event-card-body">
                  <span className="event-date">📅 {formatDate(event.startsAt)}</span>
                  <div className="seat-summary">
                    <span className="available-badge">✅ {event.seatStats.available}</span>
                    <span className="booked-badge">📌 {event.seatStats.booked}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="booking-panel glass-card">
          {selectedEvent && (
            <div className="event-hero">
              <div className="event-hero-content">
                <p className="eyebrow">🎯 Selected Event</p>
                <h2>{selectedEvent.name}</h2>
                <p className="event-meta">
                  <span>📍 {selectedEvent.venue}</span>
                  <span>⏰ {formatDate(selectedEvent.startsAt)}</span>
                </p>
              </div>
              <div className="metric-row">
                <div className="metric-card">
                  <strong className="metric-value available-color">{selectedEvent.seatStats.available}</strong>
                  <span className="metric-label">Available</span>
                </div>
                <div className="metric-card">
                  <strong className="metric-value reserved-color">{selectedEvent.seatStats.reserved}</strong>
                  <span className="metric-label">Reserved</span>
                </div>
                <div className="metric-card">
                  <strong className="metric-value booked-color">{selectedEvent.seatStats.booked}</strong>
                  <span className="metric-label">Booked</span>
                </div>
              </div>
            </div>
          )}

          {(error || notice) && (
            <div className={`alert ${error ? "error" : "success"} animate-slide-down`}>
              <span className="alert-icon">{error ? "❌" : "✅"}</span>
              {error || notice}
            </div>
          )}

          <div className="seat-tools">
            <div className="legend">
              <span><i className="available-dot"></i> Available</span>
              <span><i className="selected-dot"></i> Selected</span>
              <span><i className="reserved-dot"></i> Reserved</span>
              <span><i className="booked-dot"></i> Booked</span>
            </div>

            <div className="selection-status">
              {reservation ? (
                <div className="timer-glass">
                  <span className="timer-icon">⏱️</span>
                  <strong className="timer-value">{formatTimer(reservationMsLeft)}</strong>
                </div>
              ) : (
                <div className="selection-count">
                  <strong>{selectedSeats.length}</strong>
                  <span>Seats selected</span>
                </div>
              )}
            </div>
          </div>

          <div className="seat-grid-container">
            <div className="seat-grid" aria-label="Seat grid">
              {eventDetails?.seats.map(seat => {
                const isSelected = selectedSeats.includes(seat.seatNumber);
                const className = `seat ${seat.status} ${isSelected ? "selected" : ""}`;

                return (
                  <button
                    type="button"
                    key={seat.seatNumber}
                    className={className}
                    onClick={() => toggleSeat(seat)}
                    disabled={seat.status !== "available" || Boolean(reservation)}
                    title={`${seat.seatNumber} is ${seat.status}`}
                  >
                    {seat.seatNumber}
                  </button>
                );
              })}
            </div>
          </div>

          <footer className="action-bar">
            <div className="selection-info">
              <span className="muted">Selected Seats</span>
              <strong className="selected-seats-list">
                {selectedSeats.length ? selectedSeats.join(", ") : "No seats selected"}
              </strong>
            </div>

            <div className="actions">
              <button
                className="secondary-button"
                type="button"
                disabled={!selectedSeats.length || Boolean(reservation) || loading}
                onClick={() => setSelectedSeats([])}
              >
                🗑️ Clear
              </button>
              {!reservation ? (
                <button
                  className="primary-button pulse-on-hover"
                  type="button"
                  disabled={!selectedSeats.length || loading}
                  onClick={reserveSeats}
                >
                  {loading ? "⏳ Reserving..." : "🔒 Reserve Seats"}
                </button>
              ) : (
                <button
                  className="primary-button pulse-on-hover"
                  type="button"
                  disabled={loading}
                  onClick={confirmBooking}
                >
                  {loading ? "⏳ Confirming..." : "✅ Confirm Booking"}
                </button>
              )}
            </div>
          </footer>

          {booking && (
            <div className="receipt glass-card animate-slide-up">
              <div className="receipt-header">
                <span className="receipt-icon">🎟️</span>
                <span className="receipt-title">Booking Confirmed!</span>
              </div>
              <div className="receipt-details">
                <div className="receipt-row">
                  <span>Booking ID</span>
                  <strong>{booking.bookingId}</strong>
                </div>
                <div className="receipt-row">
                  <span>Seats</span>
                  <strong>{booking.seatNumbers.join(", ")}</strong>
                </div>
              </div>
            </div>
          )}
        </section>
      </section>
    </div>
  );
}