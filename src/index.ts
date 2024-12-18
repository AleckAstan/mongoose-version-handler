import mongoose, {SaveOptions, Schema} from 'mongoose';
import {diff, jsonPatchPathConverter} from 'just-diff';
import {applyPatch} from 'fast-json-patch';

const mongooseVersionHandler = (schema: Schema, options: any) => {
    const versionKey =
        options && options.versionKey ? options.versionKey : 'documentVersion';
    const versionDateKey =
        options && options.versionDateKey
            ? options.versionDateKey
            : 'documentVersionDate';
    const connection =
        options && options.connection ? options.connection : mongoose;
    const trackDate = !!(options && options.trackDate);
    const addDateToDocument = !!(options && options.addDateToDocument);

    function getVersionModel(collectionName: string) {
        if (connection.models[collectionName]) {
            return connection.model(collectionName);
        }

        const schemaConfig: any = {
            parent: mongoose.SchemaTypes.ObjectId,
            version: Number,
            patches: [
                {
                    op: String,
                    path: String,
                    value: mongoose.SchemaTypes.Mixed,
                },
            ],
            metadata: mongoose.SchemaTypes.Mixed
        };

        if (trackDate) {
            schemaConfig.date = Date;
        }

        const ChangeSet = new mongoose.Schema(schemaConfig);

        return connection.model(collectionName, ChangeSet);
    }

    const schemaMod: any = {};
    schemaMod[versionKey] = Number;
    if (addDateToDocument) {
        schemaMod[versionDateKey] = Date;
    }
    schema.add(schemaMod);

    schema.pre(
        'save',
        function (next, opts: SaveOptions & { metadata?: Record<string, any>, disablePreSaveHook?: boolean }) {
            if (opts?.disablePreSaveHook) return next();
            const historyModel = getVersionModel(
                options && options.collection
                    ? options.collection
                    : this.collection.name + '_h',
            );
            const date = new Date();

            if (this.isNew || !this[versionKey]) {
                this[versionKey] = 1;
                if (trackDate && addDateToDocument) {
                    this[versionDateKey] = date;
                }
                const patches = diff({}, this.toObject(), jsonPatchPathConverter);

                const versionObject: any = {
                    parent: this._id,
                    version: this[versionKey],
                    patches: patches,
                    metadata: opts?.metadata
                };

                if (trackDate) {
                    versionObject.date = date;
                }

                const version = new historyModel(versionObject);
                version.save();
                return next();
            }

            (this as any)[versionKey]++;
            if (trackDate && addDateToDocument) {
                this[versionDateKey] = date;
            }
            const newVersion: any = this.toObject();

            historyModel
                .find({parent: this._id})
                .sort({version: 1})
                .then(
                    function (versions: any) {
                        let patches: any = [];
                        for (let i = 0; i < versions.length; i++) {
                            patches = patches.concat(versions[i].patches);
                        }

                        const {newDocument: previousVersion} = applyPatch({}, patches);

                        patches = diff(previousVersion, newVersion, jsonPatchPathConverter);

                        const versionObject: any = {
                            parent: newVersion._id,
                            version: newVersion[versionKey],
                            patches: patches,
                            metadata: opts?.metadata
                        };

                        if (trackDate) {
                            versionObject.date = date;
                        }

                        const version = new historyModel(versionObject);

                        version.save();
                        next();
                    }.bind(this),
                );
        },
    );

    schema.methods.getVersion = function (versionNumber: any, cb: any) {
        if (versionNumber < 1 || versionNumber > this[versionKey]) {
            const vErr = new Error(
                'The version number cannot be smaller than 1 or larger than ' +
                this[versionKey],
            );
            if (cb instanceof Function) {
                cb(vErr);
            }
            throw vErr;
        }

        const historyModel = getVersionModel(
            options && options.collection
                ? options.collection
                : this.collection.name + '_h',
        );
        return historyModel
            .where('parent')
            .equals(this._id)
            .where('version')
            .lte(versionNumber)
            .select('patches')
            .sort({version: 1})
            .exec()
            .then(function (results: any) {
                let patches: any = [];
                for (let i = 0; i < results.length; i++) {
                    patches = patches.concat(results[i].patches);
                }
                const {newDocument} = applyPatch({}, patches);
                return newDocument;
            })
            .catch(function (err: any) {
                if (cb instanceof Function) {
                    cb(err);
                }
                throw err;
            });
    };

    schema.methods.rollback = async function (cb: any) {
        const historyModel = getVersionModel(
            options && options.collection
                ? options.collection
                : this.collection.name + '_h',
        );
        if (this[versionKey] === 1) {
            await this.deleteOne();
            await historyModel.deleteOne({parent: this._id, version: 1});
            if (cb instanceof Function) {
                return cb(null, {
                    message: 'Document deleted as it had no previous versions.',
                });
            }
            return {message: 'Document deleted as it had no previous versions.'};
        }

        const previousVersion = await historyModel
            .where('parent')
            .equals(this._id)
            .where('version')
            .lt(this[versionKey])
            .sort({version: -1})
            .limit(1)
            .exec()
            .then((results: any) => results[0])
            .catch((err: any) => {
                if (cb instanceof Function) {
                    return cb(err);
                }
                throw err;
            });

        if (!previousVersion) {
            const err = new Error('No previous version found.');
            if (cb instanceof Function) {
                return cb(err);
            }
            throw err;
        }
        try {
            const {newDocument} = applyPatch(this, previousVersion.patches);
            Object.assign(this, newDocument);
            this[versionKey] = previousVersion.version;

            await this.save({disablePreSaveHook: true});
            await historyModel.deleteOne({
                parent: this._id,
                version: this[versionKey] + 1,
            });

            if (cb instanceof Function) {
                return cb(null, this);
            }
            return this;
        } catch (err) {
            if (cb instanceof Function) {
                return cb(err);
            }
            throw err;
        }
    };

    schema.statics.getHistoryModel = function () {
        return getVersionModel(
            options && options.collection
                ? options.collection
                : this.collection.name + '_h',
        );
    };
};

export default mongooseVersionHandler;
