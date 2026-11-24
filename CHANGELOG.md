# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Core: the library model, the group, site, todo, settings and library commands with their agent classes, JSON export and import that name every wrong field, and the sample library of the English drawing (#9).
- Core: a snapshot after every change burst marked with its source, retention of the newest 20 and one a day for 7 days, undo, redo, an undoable restore with a preview, and a diff summary between two snapshots (#10).
- Store: the `Store` interface that runs a command by id and keeps a snapshot of each change, the memory store, and `ExtStore` on `chrome.storage.local` with a schema version, migrations, and a fallback to the newest readable snapshot when the stored library is corrupt (#11).

### Changed

- Design: the drawing, its sample data and every frame in `docs/design/png/` are now in English (QUB-1297).
