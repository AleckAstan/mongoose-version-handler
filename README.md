# mongoose-version-handler

A Mongoose plugin to manage document versioning and history with JSON Patch diffs, now featuring rollback functionality and full support for NestJS.

---

## Installation

Install the plugin via npm:

```bash
npm install mongoose-version-handler
```

---

## Purpose

The `mongoose-version-handler` plugin allows you to:

1. Track changes made to documents over time.
2. Maintain a version history using JSON Patch format.
3. Retrieve any version of a document easily.
4. Rollback documents to previous versions.
5. Seamlessly integrate with NestJS.

---

## Basic Usage

Add the plugin to your schema:

```typescript
import { Schema } from 'mongoose';
import mongooseVersionHandler from 'mongoose-version-handler';

const UserSchema = new Schema({
    name: {
        firstname: String,
        lastname: String,
    },
});

// Add versioning plugin
UserSchema.plugin(mongooseVersionHandler);
```

The plugin will:
- Add a version field (`documentVersion` by default) to your schema.
- Maintain a separate history collection storing JSON Patch diffs for each change.
- Automatically increment the version number on each save/update.

---

## Options

### `versionKey`

Specifies the version field name added to the schema. Default: `documentVersion`.

---

### `collection`

Sets the name of the history collection. Default: `<original_collection>_h`.

---

### `connection`

Passes a specific database connection for version tracking. This is required when using `mongoose.createConnection`.

**Example**:

```typescript
import mongoose, { Schema } from 'mongoose';
import mongooseVersionHandler from 'mongoose-version-handler';

const db = mongoose.createConnection('mongodb://localhost/my-database');

const UserSchema = new Schema({
    name: {
        first: String,
        last: String,
    },
});

UserSchema.plugin(mongooseVersionHandler, { connection: db });
```

---

### `trackDate`

Tracks the creation date for each version. Adds a `date` field to the history collection when enabled.

---

### `addDateToDocument`

Stores the version creation date redundantly in the main document. Requires `trackDate: true`.

---

### `versionDateKey`

Specifies the name of the date field added to the document when `addDateToDocument` is enabled. Default: `documentVersionDate`.

---

## Retrieving a Specific Document Version

You can retrieve any version of a document using the `getVersion()` method:

```typescript
const user = await User.findOne({ ... });
const version2 = await user.getVersion(2);
```

`getVersion()` returns a Promise resolving to the document version.

---

## Rolling Back a Document

Rollback to a previous version using the `rollback()` method:

```typescript
const user = await User.findOne({ ... });
await user.rollback();
```

- If a previous version exists, the document rolls back to that version.
- If no previous version exists, the document will be deleted.

---

## Accessing the History Collection

To query the history collection directly, use the `getHistoryModel()` method:

```typescript
const UserHistory = User.getHistoryModel();
const history = await UserHistory.find({ parent: user._id });
```

The history collection schema looks like this:

```typescript
const ChangeSet = new mongoose.Schema({
    parent: mongoose.SchemaTypes.ObjectId, // Source document ID
    version: Number,                      // Version number
    patches: [{                           // JSON Patch changes
        op: String,
        path: String,
        value: mongoose.SchemaTypes.Mixed,
    }],
    date: Date, // Available if 'trackDate' is enabled
});
```

---

## NestJS Integration

The plugin includes support for NestJS applications.

### Example: Using the Plugin in a NestJS Module

```typescript
import { Module } from '@nestjs/common';
import { MongooseModule, getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import mongooseVersionHandler from 'mongoose-version-handler';

import { CatSchema, Cat } from './cat.schema';
import { CatController } from './cat.controller';
import { CatService } from './cat.service';

@Module({
    imports: [
        MongooseModule.forFeatureAsync([
            {
                name: Cat.name,
                inject: [getConnectionToken()],// inject the connection token
                useFactory: (connection: Connection) => {
                    const schema = CatSchema;
                    schema.plugin(mongooseVersionHandler, { connection }); // pass injected connection to the plugin options
                    return schema; //return the modified schema
                },
            },
        ]),
    ],
    controllers: [CatController],
    providers: [CatService],
})
export class CatModule {}
```

### Using Versioning Methods in Your Service

In your NestJS service, you can use the `getVersion()` and `rollback()` methods as demonstrated:

```typescript
const cat = await this.catModel.findOne({ ... });
const previousVersion = await cat.getVersion(2);
await cat.rollback();
```

---

## Key Features Recap

- **Automatic Version Tracking**: Tracks document changes with JSON Patch diffs.
- **Rollback Support**: Revert documents to previous versions with ease.
- **Customizable Options**: Configure version keys, history collections, and connection settings.
- **NestJS Ready**: Works seamlessly with NestJS and dependency injection.

---

## Why Use mongoose-version-handler?

- Provides a reliable, structured way to manage document versions.
- Enables clear tracking of changes and rollbacks.
- Fits naturally into both Mongoose and NestJS workflows.

---

Feel free to explore the plugin, contribute, or report any issues.
