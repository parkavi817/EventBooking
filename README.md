# MERN Event Ticket Booking

A simplified full-stack event ticket booking flow built with MongoDB, Express, React, and Node.js. Users can sign up or log in, browse events, reserve available seats for 10 minutes, and confirm the booking before the reservation expires.

## Features

- Basic authentication with email/password and bearer sessions
- Event list with available, reserved, and booked seat counts
- Event detail page with responsive seat grid
- Multi-seat reservation with a 10-minute countdown
- Booking confirmation from an active reservation
- Error handling when selected seats become unavailable
- MongoDB models for Event, Seat, Reservation, Booking, User, and Session

## Backend Setup

```bash
cd backend
npm install
npm start
```

The backend runs on `http://localhost:5000`.

By default it connects to:

```bash
mongodb://127.0.0.1:27017/event_ticket_booking
```

You can override that with:

```bash
set MONGO_URI=mongodb://127.0.0.1:27017/event_ticket_booking
npm start
```

On startup, the backend ensures ten sample events exist and creates seats for any newly seeded events.

## Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The Vite app usually runs on `http://localhost:5173`.

## API Endpoints

- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Current user
- `POST /api/auth/logout` - Logout
- `GET /api/events` - Retrieve all events with seat counts
- `GET /api/events/:id` - Retrieve one event with its seats
- `POST /api/reserve` - Reserve available seats for 10 minutes
- `POST /api/bookings` - Confirm booking from an active reservation

## Assumptions

- A reservation can hold up to 8 seats.
- Seeded events are topped up by event name so the sample list reaches ten events.
- Users must be logged in to reserve or book seats.
- Expired reservations are released on event reads, reserve attempts, and a background interval.

## Design Decisions

Double booking is prevented with conditional MongoDB updates. During reservation, seats are updated only if every requested seat still has `status: "available"`. If the number of modified seats does not match the requested seat count, the reservation is rejected, any seats touched by that reservation are rolled back, and the client refreshes seat status.

Booking only confirms seats that still belong to the same active reservation, same user, and have not expired. After a successful booking, the reservation document is removed. Expired reservations are marked as expired and their seats are returned to `available`.
