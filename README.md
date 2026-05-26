# Sentinel Gateway

---

. Sprint 1:

Amr done:
GET /kong/health

POST /kong/services
GET /kong/services
GET /kong/services/:name
PATCH /kong/services/:name
DELETE /kong/services/:name

POST /kong/services/:serviceName/routes
GET /kong/services/:serviceName/routes
GET /kong/routes
GET /kong/routes/:routeIdOrName
PATCH /kong/routes/:routeIdOrName
DELETE /kong/routes/:routeIdOrName

localhost:3000 = Sentinel/Nest controller
localhost:8001 = Kong Admin API
localhost:8000 = Kong Proxy, real traffic goes here
