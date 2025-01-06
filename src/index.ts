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
        async function (next, opts: SaveOptions & { metadata?: Record<string, any>, disablePreSaveHook?: boolean }) {
            if (opts?.disablePreSaveHook) return next();
            const historyModel = getVersionModel(
                options && options.collection
                    ? options.collection
                    : this.collection.name + '_h',
            );
            const date = new Date();

            if (this.isNew && !this[versionKey]) {
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
                await version.save();
                return next();
            }


            if (!this.isNew && !this[versionKey]) {
                const oldDoc = await (this.constructor as any).findById(this._id).lean();
                if (!oldDoc) return next();
                if (trackDate && addDateToDocument) {
                    this[versionDateKey] = date;
                }
                this[versionKey] = 1;
                const creationPatches = diff({}, oldDoc, jsonPatchPathConverter);
                this[versionKey] = 2;
                const updatePatches = diff(oldDoc, this.toObject(), jsonPatchPathConverter);
                const creationVersionObject: any = {
                    parent: this._id,
                    version: 1,
                    patches: creationPatches,
                    metadata: opts?.metadata
                };
                const updateVersionObject: any = {
                    parent: this._id,
                    version: 2,
                    patches: updatePatches,
                    metadata: opts?.metadata
                };

                if (trackDate) {
                    creationVersionObject.date = date;
                    updateVersionObject.date = date;
                }

                const creationVersion = new historyModel(creationVersionObject);
                const updateVersion = new historyModel(updateVersionObject);
                await creationVersion.save();
                await updateVersion.save();
                return next()
            }

            (this as any)[versionKey]++;
            if (trackDate && addDateToDocument) {
                this[versionDateKey] = date;
            }
            const newVersion: any = this.toObject();

            const versions: Array<any> = await historyModel
                .find({parent: this._id})
                .sort({version: 1})

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

            const version = await new historyModel(versionObject);
            await version.save();
            next();
        },
    );

    schema.pre('findOneAndUpdate', async function (next) {
        const opts = this.getOptions();
        if (opts?.disablePreSaveHook) return next();
        const date = new Date();
        const query = this.getFilter();
        const doc = await this.model.findOne(query);
        if(!doc) return next();
        const docPojo = doc.toObject();
        const currentVersion: number = (docPojo as any)[versionKey]
        this.set(versionKey, currentVersion ? currentVersion + 1 : 2);
        this.setOptions({new:true})// this option return the result document after update so we can use it in post hook
        if(!currentVersion) {
            const historyModel = getVersionModel(
                doc.collection.name + '_h'
            );
            const patches = diff({}, docPojo, jsonPatchPathConverter);
            const versionObject: any = {
                parent: docPojo._id,
                version: 1,
                patches: patches,
                metadata: opts?.metadata
            };
            if (trackDate) {
                versionObject.date = date;
            }
            const version = await new historyModel(versionObject);
            await version.save();
        }

        if (addDateToDocument) {
            this.set(versionDateKey, date);
        }
        next()
    })
    schema.post('findOneAndUpdate', async function (this,doc) {
        const opts = this.getOptions();
        if (opts?.disablePreSaveHook) return;
        const date = new Date();
        const newVersion = doc.toObject();
        const historyModel = getVersionModel(
            doc.collection.name + '_h'
        );
        const versions: Array<any> = await historyModel
            .find({parent: doc._id})
            .sort({version: 1})
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

        const version = await new historyModel(versionObject);
        await version.save();
    })


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
            this['__v'] = undefined;

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
