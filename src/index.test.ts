import mongoose, {Document, Model, SaveOptions, Schema} from 'mongoose';
import {MongoMemoryServer} from 'mongodb-memory-server';
import mongooseVersionHandler from "./index";

interface TestDocument extends Document {
    name: string;
    documentVersion?: number;
    documentVersionDate?: Date;
    getVersion: (versionNumber: number) => Promise<any>;
    rollback: () => Promise<any>;
}

interface TestModel extends Model<TestDocument> {
    getHistoryModel: () => Model<any>;
}

describe('mongooseVersionHandler Plugin', () => {

    const setupTestModel = (pluginOptions?: any) => {
        const testSchema = new Schema<TestDocument>({
            name: {type: String, required: true},
        });
        // Apply the plugin
        testSchema.plugin(mongooseVersionHandler, pluginOptions);
        return connection.model<TestDocument, TestModel>('Test', testSchema);
    };

    let mongoServer: MongoMemoryServer;
    let connection: typeof mongoose;
    let TestModel: TestModel;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        connection = await mongoose.connect(uri);
        TestModel = setupTestModel({trackDate: true, addDateToDocument: true});
    });

    afterAll(async () => {
        await connection.disconnect();
        await mongoServer.stop();
    });


    describe('save method', () => {

        it('should not create history or version when pre-save hook is disabled', async () => {
            const doc = new TestModel({name: 'unversioned Doc'});
            const created = await doc.save({disablePreSaveHook: true} as SaveOptions & { disablePreSaveHook: boolean });
            const historyModel = TestModel.getHistoryModel();
            const noHistory = await historyModel.find({parent: doc._id});
            expect(noHistory.length).toBe(0)
        });

        it('should initialize a new document with version 1 and creation date', async () => {
            const doc = new TestModel({name: 'Document 1'});
            await doc.save();
            expect(doc.documentVersion).toBe(1);
            expect(doc.documentVersionDate).toBeDefined();
            const historyModel = TestModel.getHistoryModel();
            const history = await historyModel.findOne({parent: doc._id});
            expect(history).toBeDefined();
        });

        it('should increment version and store changes on update', async () => {
            const doc = new TestModel({name: 'Document 2'});
            await doc.save();
            doc.name = 'Updated Document 2';
            await doc.save();
            expect(doc.documentVersion).toBe(2);
            const historyModel = TestModel.getHistoryModel();
            const history = await historyModel.find({parent: doc._id}).sort({version: 1});
            expect(history.length).toBe(2);
            expect(history[1].version).toBe(2);
            expect(history[1].patches).toBeDefined();
        });

        it('should include custom metadata in the version history', async () => {
            const doc = new TestModel({name: 'With metadata'});
            await doc.save({metadata: {createdBy: 'user1'}} as SaveOptions & { metadata?: Record<string, any> });
            const historyModel = TestModel.getHistoryModel();
            doc.name = 'Updated With metadata 2';
            await doc.save({metadata: {createdBy: 'user2'}} as SaveOptions & { metadata?: Record<string, any> });
            const history = await historyModel.find({parent: doc._id}).sort({version: 1});
            expect(history[0].metadata.createdBy).toBeDefined();
            expect(history[0].metadata.createdBy).toBe('user1');
            expect(history[1].metadata.createdBy).toBeDefined();
            expect(history[1].metadata.createdBy).toBe('user2');
        });


        it('should create history entries for unversioned documents upon first update', async () => {
            const doc = new TestModel({name: 'Unversioned Doc'});
            const created = await doc.save({disablePreSaveHook: true} as SaveOptions & { disablePreSaveHook: boolean });
            const historyModel = TestModel.getHistoryModel();
            created.name = 'Updated to Version 2';
            const updated = await doc.save();
            const histories = await historyModel.find({parent: doc._id});
            expect(histories.length).toBe(2);
            expect(updated.documentVersion).toBe(2);
        });

        it('should retrieve a specific version of a document', async () => {
            const doc = new TestModel({name: 'Versioned Doc'});
            const created = await doc.save();
            created.name = 'Updated to Version 2';
            const updated = await doc.save();
            const version1 = await updated.getVersion(1);
            expect(version1).toBeDefined();
            expect(version1.name).toBe('Versioned Doc');
        });

        it('should rollback to the previous version of the document', async () => {
            const doc = new TestModel({name: 'Rollback Test'});
            const saved = await doc.save();
            saved.name = 'Updated Name';
            const updated = await saved.save();
            expect(updated.documentVersion).toBe(2);
            await updated.rollback();
            const rollbacked = await TestModel.findById(updated._id);
            expect(rollbacked).toBeDefined();
            expect(rollbacked?.documentVersion).toBe(1);
            expect(rollbacked?.name).toBe('Rollback Test');
            const historyModel = TestModel.getHistoryModel();
            const remainingHistory = await historyModel.find({parent: doc._id});
            expect(remainingHistory.length).toBe(1);
        });

        it('should delete the document when rolling back from version 1', async () => {
            const doc = new TestModel({name: 'Delete on Rollback'});
            await doc.save();
            await doc.rollback();
            const foundDoc = await TestModel.findById(doc._id);
            expect(foundDoc).toBeNull();
            const historyModel = TestModel.getHistoryModel();
            const history = await historyModel.findOne({parent: doc._id});
            expect(history).toBeNull();
        });
    })

    describe('findOneAndUpdate method', () => {
        it('should increment version and store changes on update', async () => {
            const doc = new TestModel({name: 'Document 2'});
            await doc.save();
            const updated = await TestModel.findOneAndUpdate({name: 'Document 2'}, {name: 'Updated Document 2'});
            expect(updated?.documentVersion).toBe(2);
            const historyModel = TestModel.getHistoryModel();
            const history = await historyModel.find({parent: doc._id}).sort({version: 1});
            expect(history.length).toBe(2);
            expect(history[1].version).toBe(2);
            expect(history[1].patches).toBeDefined();
        });

        it('should include custom metadata in the version history', async () => {
            const doc = new TestModel({name: 'With metadata'});
            await doc.save();
            const historyModel = TestModel.getHistoryModel();
             await TestModel.findOneAndUpdate({name: 'With metadata'}, {name: 'Updated Document 2'}, {metadata: {createdBy: 'user1'}});
            const history = await historyModel.find({parent: doc._id}).sort({version: 1});
            expect(history[1].metadata.createdBy).toBeDefined();
            expect(history[1].metadata.createdBy).toBe('user1');
        });

        it('should create history entries for unversioned documents upon first update', async () => {
            const doc = new TestModel({name: 'Unversioned Doc'});
            const created = await doc.save({disablePreSaveHook: true} as SaveOptions & { disablePreSaveHook: boolean });
            const historyModel = TestModel.getHistoryModel();
            const updated = await TestModel.findOneAndUpdate({name: 'Unversioned Doc'}, {name: 'Updated Document 2'});

            const histories = await historyModel.find({parent: doc._id});
            expect(histories.length).toBe(2);
            expect(updated?.documentVersion).toBe(2);
        });
    })
});
