# Wattanam Announcements Reference Plugin

This package is the first signed reference plugin for the Wattanam plugin contract. It demonstrates a namespaced manifest, permissions and navigation, backend lifecycle and health checks, versioned events, two namespaced API routes, scoped JSON settings, scoped file storage, a persisted hourly job, a signed namespaced SQL migration, language declarations, support/privacy metadata, and a generic frontend settings page.

The existing announcements business feature remains in core until the new migration and route lifecycle passes PostgreSQL integration testing and a customer-data migration is reviewed. Removing it earlier would risk losing existing announcements. This package is the complete SDK reference implementation; the final business-data cutover remains an explicit compatibility migration.
