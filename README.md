# نظام الطلبات البلدية (Municipal Requests System)

A comprehensive municipal service requests (complaints) management system in Arabic with full RTL support.

## Overview

This system enables:
- **Citizens** to submit and track service requests anonymously (no login required)
- **District Administrators** to manage requests within their neighborhood
- **Municipal Administrators** to oversee performance across all districts
- **Staff/Field Workers** to receive and complete assigned work orders

## Features

### Citizen Portal (Public Access)
- ✅ Submit service requests without login
- ✅ Choose category (إنارة, مياه, نفايات, طرق, أخرى)
- ✅ Select district from dropdown
- ✅ Add description and optional photo
- ✅ Optional location (address text)
- ✅ Receive unique tracking code
- ✅ Track request status with public timeline
- ✅ Real-time status updates

### District Admin Dashboard
- ✅ View all requests for assigned district
- ✅ Filter by status, category, priority, date
- ✅ Role-based access control (district-scoped)
- ✅ View request details and timeline
- ✅ Track overdue requests with SLA alerts

### Municipal Admin Dashboard
- ✅ Municipality-wide KPI overview
- ✅ View all districts' requests
- ✅ Performance metrics by district
- ✅ Filter and search capabilities
- ✅ Overdue request tracking

### System Features
- ✅ Full Arabic UI with RTL layout
- ✅ Role-based authentication
- ✅ Status workflow management
- ✅ SLA tracking (automatic overdue flagging)
- ✅ Audit trail for all actions
- ✅ Mobile-responsive design
- ✅ Modern Arabic typography (Cairo & Tajawal fonts)

## Technology Stack

- **Frontend**: React 19 + TypeScript
- **Styling**: Tailwind CSS with custom Arabic theme
- **UI Components**: shadcn/ui v4
- **Icons**: Phosphor Icons
- **State Management**: Spark useKV hooks (persistent storage)
- **Build Tool**: Vite

## Setup Instructions

The system is pre-configured and ready to run. All seed data has been initialized.

### Access Credentials

**Municipal Admin (Full Access)**
- Email: `admin@mun.sa`
- Password: `admin123`
- Access: All districts in municipality

**District Admin (حي العليا)**
- Email: `district1@mun.sa`
- Password: `pass123`
- Access: حي العليا only

**District Admin (حي الملز)**
- Email: `district2@mun.sa`
- Password: `pass123`
- Access: حي الملز only

## Data Model

### Entities

**Municipalities** (بلديات)
- بلدية الرياض (Riyadh Municipality)

**Districts** (أحياء)
- حي العليا (Al-Olaya District)
- حي الملز (Al-Malaz District)
- حي النخيل (An-Nakheel District)
- حي الصحافة (As-Sahafa District)

**Request Categories**
- إنارة (Lighting) - SLA: 3 days
- مياه (Water) - SLA: 1 day
- نفايات (Waste) - SLA: 2 days
- طرق (Roads) - SLA: 7 days
- أخرى (Other) - SLA: 5 days

**Request Statuses**
- مُرسلة (Submitted)
- مستلمة (Received)
- قيد المعالجة (In Progress)
- منجزة (Completed)
- مرفوضة (Rejected)

## Sample Requests

The system includes 5 pre-seeded requests demonstrating different statuses:

1. **LT8H3K9P** - Lighting issue in Al-Olaya (In Progress)
2. **WS2M7N4Q** - Waste collection delay in Al-Malaz (Submitted)
3. **RD5P8T2X** - Road pothole in Al-Olaya (Received, Urgent)
4. **WT9K6H3M** - Water leak in An-Nakheel (Completed)
5. **OT4L9X7R** - Park bench request in As-Sahafa (Rejected)

## User Workflow

### Citizen Journey
1. Visit homepage
2. Click "تقديم طلب" (Submit Request)
3. Fill form: category, district, description, optional photo/address
4. Click "إرسال الطلب" (Submit Request)
5. Receive tracking code (e.g., LT8H3K9P)
6. Use "تتبع طلب" (Track Request) tab to monitor status

### Admin Journey
1. Click "تسجيل الدخول الإداري" (Admin Login)
2. Enter credentials
3. View dashboard with KPIs
4. Filter requests by status/category/district
5. Click request to view details
6. Track overdue requests (flagged in red)

## SLA & Overdue Logic

Each category has a defined Service Level Agreement (SLA):
- Requests exceeding their SLA days are automatically flagged as "متأخر" (Overdue)
- Overdue count displayed prominently in admin dashboard
- Color-coded status badges for visual priority

## Security Features

- ✅ Role-based access control (RBAC)
- ✅ District-scoped data access
- ✅ Password-protected admin access
- ✅ No direct data deletion (status transitions only)
- ✅ Audit logging for all actions
- ✅ Anonymous citizen submissions

## Responsive Design

- Mobile-first approach
- Touch-optimized controls
- Responsive tables convert to cards on mobile
- Bottom-fixed CTAs on mobile forms
- Collapsible filters for small screens

## Arabic Typography

**Font Families:**
- **Cairo** (Google Fonts) - Headers, buttons, titles
  - Bold for H1, SemiBold for H2, Medium for H3
- **Tajawal** (Google Fonts) - Body text, descriptions
  - Provides warmth and readability for long-form content

## Color Palette

**Primary**: Deep governmental blue `oklch(0.35 0.08 250)`
**Accent**: Amber alert `oklch(0.70 0.15 65)`
**Status Colors**:
- Submitted: Gray `oklch(0.60 0.01 240)`
- Received: Blue `oklch(0.55 0.10 250)`
- In Progress: Amber `oklch(0.65 0.13 65)`
- Completed: Green `oklch(0.60 0.15 145)`
- Rejected: Red `oklch(0.55 0.18 25)`

## Architecture Notes

This is a **frontend-only implementation** using:
- Spark's `useKV` hooks for persistent storage (simulates database)
- Local state management (no external backend)
- All business logic in React components

For production deployment with a real backend:
1. Replace `useKV` calls with API endpoints
2. Implement proper authentication (JWT/OAuth)
3. Add PostgreSQL database
4. Implement file upload to cloud storage
5. Add email/SMS notifications
6. Implement proper audit logging

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Android)

## License

© 2024 Municipal Requests System. All rights reserved.
