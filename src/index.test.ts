import mongoose, {Schema, Document, Model} from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
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
            name: { type: String, required: true },
        });
        // Apply the plugin
        testSchema.plugin(mongooseVersionHandler, pluginOptions);
        return connection.model<TestDocument,TestModel>('Test', testSchema);
    };

    let mongoServer: MongoMemoryServer;
    let connection: typeof mongoose;
    let TestModel:TestModel;

    beforeAll(async () => {
        mongoServer = await MongoMemoryServer.create();
        const uri = mongoServer.getUri();
        connection = await mongoose.connect(uri);
        TestModel = setupTestModel({ trackDate: true, addDateToDocument: true });
    });

    afterAll(async () => {
        await connection.disconnect();
        await mongoServer.stop();
    });

    it('should create a new document with version 1', async () => {
        const doc = new TestModel({ name: 'Document 1' });
        await doc.save();
        expect(doc.documentVersion).toBe(1);
        expect(doc.documentVersionDate).toBeDefined();
        const historyModel = TestModel.getHistoryModel();
        const history = await historyModel.findOne({ parent: doc._id });
        expect(history).toBeDefined();
    });

    it('should increment version and save patches on update', async () => {
        const doc = new TestModel({ name: 'Document 2' });
        await doc.save();
        doc.name = 'Updated Document 2';
        await doc.save();
        expect(doc.documentVersion).toBe(2);
        const historyModel = TestModel.getHistoryModel();
        const history = await historyModel.find({ parent: doc._id }).sort({ version: 1 });
        expect(history.length).toBe(2);
        expect(history[1].version).toBe(2);
        expect(history[1].patches).toBeDefined();
    });

    it('should retrieve a specific version', async () => {
        const doc = new TestModel({ name: 'Versioned Doc' });
        await doc.save();
        doc.name = 'Updated to Version 2';
        await doc.save();
        const version1 = await doc.getVersion(1);
        expect(version1).toBeDefined();
        expect(version1.name).toBe('Versioned Doc');
    });

    it('should rollback to the previous version', async () => {
        const doc = new TestModel({ name: 'Rollback Test' });
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
        const remainingHistory = await historyModel.find({ parent: doc._id });
        expect(remainingHistory.length).toBe(1);
    });

    it('should delete document if rolling back from version 1', async () => {
        const doc = new TestModel({ name: 'Delete on Rollback' });
        await doc.save();
        await doc.rollback();
        const foundDoc = await TestModel.findById(doc._id);
        expect(foundDoc).toBeNull();
        const historyModel = TestModel.getHistoryModel();
        const history = await historyModel.findOne({ parent: doc._id });
        expect(history).toBeNull();
    });
});
