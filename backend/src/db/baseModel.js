import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import crypto from 'crypto';

import { dynamo, TABLE_NAME } from './dynamoClient.js';
import { getModel, registerModel } from './modelRegistry.js';

function toPath(path) {
  return path.startsWith('$') ? path.slice(1) : path;
}

function getValue(obj, path) {
  const segments = toPath(path).split('.');
  let current = obj;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

function setValue(obj, path, value) {
  const segments = path.split('.');
  let current = obj;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const key = segments[i];
    if (current[key] == null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[segments[segments.length - 1]] = value;
}

function normalizeData(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((entry) => normalizeData(entry));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = normalizeData(entry);
    }
    return out;
  }
  return value;
}

function matchesFilter(doc, filter = {}) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = getValue(doc, key);

    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$in' in expected) {
        return expected.$in.map(String).includes(String(actual));
      }
      if ('$regex' in expected) {
        const regex = new RegExp(expected.$regex, expected.$options ?? '');
        return regex.test(String(actual ?? ''));
      }
      if ('$gt' in expected) {
        return Number(actual) > Number(expected.$gt);
      }
      return false;
    }

    return String(actual) === String(expected);
  });
}

function applyProjection(doc, projection) {
  if (!projection) return { ...doc };
  const out = { _id: doc._id };
  for (const key of Object.keys(projection)) {
    if (!projection[key]) continue;
    out[key] = doc[key];
  }
  return out;
}

function compareWithSort(a, b, sort = {}) {
  for (const [key, direction] of Object.entries(sort)) {
    const av = getValue(a, key);
    const bv = getValue(b, key);
    if (av === bv) continue;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return direction < 0 ? 1 : -1;
    if (av > bv) return direction < 0 ? -1 : 1;
  }
  return 0;
}

function toDoc(model, raw) {
  if (!raw) return null;
  const doc = { ...raw };

  Object.defineProperty(doc, 'save', {
    enumerable: false,
    value: async () => {
      doc.updatedAt = new Date().toISOString();
      await model._put({ ...doc });
      return doc;
    },
  });

  Object.defineProperty(doc, 'deleteOne', {
    enumerable: false,
    value: async () => {
      await model.deleteMany({ _id: { $in: [doc._id] } });
    },
  });

  return doc;
}

class QueryBuilder {
  constructor(model, loader, options = {}) {
    this.model = model;
    this.loader = loader;
    this.single = !!options.single;
    this.useLean = false;
    this.limitValue = null;
    this.sortValue = null;
    this.populateField = null;
  }

  sort(sort) {
    this.sortValue = sort;
    return this;
  }

  limit(limit) {
    this.limitValue = limit;
    return this;
  }

  lean() {
    this.useLean = true;
    return this;
  }

  populate(field) {
    this.populateField = field;
    return this;
  }

  async _populate(docs) {
    if (!this.populateField) return docs;
    const mapping = this.model.populates[this.populateField];
    if (!mapping) return docs;

    const targetModel = getModel(mapping.model);
    if (!targetModel) return docs;

    return Promise.all(
      docs.map(async (doc) => {
        const id = doc[this.populateField];
        if (!id) return doc;
        const populated = await targetModel.findById(id).lean();
        return { ...doc, [this.populateField]: populated };
      }),
    );
  }

  async exec() {
    let result = await this.loader();

    if (this.sortValue) {
      result = [...result].sort((a, b) => compareWithSort(a, b, this.sortValue));
    }

    if (typeof this.limitValue === 'number') {
      result = result.slice(0, this.limitValue);
    }

    result = await this._populate(result);

    if (this.single) {
      const first = result[0] ?? null;
      return this.useLean ? first : toDoc(this.model, first);
    }

    return this.useLean ? result : result.map((entry) => toDoc(this.model, entry));
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }
}

function evaluateGroupIdExpression(doc, expr) {
  if (typeof expr === 'string') return getValue(doc, expr);
  if (expr && typeof expr === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(expr)) {
      out[key] = evaluateGroupIdExpression(doc, value);
    }
    return out;
  }
  return expr;
}

function aggregateRows(rows, pipeline = []) {
  let current = [...rows];

  for (const stage of pipeline) {
    if (stage.$match) {
      current = current.filter((doc) => matchesFilter(doc, stage.$match));
      continue;
    }
    if (stage.$sort) {
      current.sort((a, b) => compareWithSort(a, b, stage.$sort));
      continue;
    }
    if (stage.$group) {
      const groups = new Map();
      for (const row of current) {
        const idValue = evaluateGroupIdExpression(row, stage.$group._id);
        const key = JSON.stringify(idValue);
        if (!groups.has(key)) groups.set(key, { _id: idValue });
        const entry = groups.get(key);
        for (const [field, op] of Object.entries(stage.$group)) {
          if (field === '_id') continue;
          if ('$sum' in op) {
            const sumValue = op.$sum === 1 ? 1 : Number(getValue(row, op.$sum) ?? 0);
            entry[field] = (entry[field] ?? 0) + sumValue;
          }
          if ('$push' in op) {
            const pushValue = getValue(row, op.$push);
            if (!Array.isArray(entry[field])) entry[field] = [];
            entry[field].push(pushValue);
          }
        }
      }
      current = Array.from(groups.values());
    }
  }

  return current;
}

export function createModel(name, options = {}) {
  const defaults = options.defaults ?? {};
  const populates = options.populates ?? {};

  const model = {
    modelName: name,
    defaults,
    populates,

    async _scanAll() {
      const out = [];
      let lastEvaluatedKey;
      do {
        const response = await dynamo.send(
          new ScanCommand({
            TableName: TABLE_NAME,
            ExclusiveStartKey: lastEvaluatedKey,
            FilterExpression: '#model = :model',
            ExpressionAttributeNames: { '#model': 'model' },
            ExpressionAttributeValues: { ':model': name },
          }),
        );
        out.push(...(response.Items ?? []));
        lastEvaluatedKey = response.LastEvaluatedKey;
      } while (lastEvaluatedKey);
      return out;
    },

    async _put(data) {
      const item = {
        ...normalizeData(data),
        model: name,
        pk: `${name}#${data._id}`,
        sk: `${name}#${data._id}`,
      };
      await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
      return item;
    },

    async create(payload) {
      const now = new Date().toISOString();
      const doc = {
        _id: crypto.randomUUID(),
        ...defaults,
        ...payload,
        createdAt: now,
        updatedAt: now,
      };
      await this._put(doc);
      return toDoc(this, doc);
    },

    findById(id) {
      return new QueryBuilder(this, async () => {
        const response = await dynamo.send(
          new GetCommand({
            TableName: TABLE_NAME,
            Key: { pk: `${name}#${id}`, sk: `${name}#${id}` },
          }),
        );
        const item = response.Item;
        return item?.model === name ? [item] : [];
      }, { single: true });
    },

    find(filter = {}, projection = null) {
      return new QueryBuilder(this, async () => {
        const rows = await this._scanAll();
        return rows
          .filter((entry) => matchesFilter(entry, filter))
          .map((entry) => applyProjection(entry, projection));
      });
    },

    findOne(filter = {}) {
      return new QueryBuilder(this, async () => {
        const rows = await this._scanAll();
        return rows.filter((entry) => matchesFilter(entry, filter));
      }, { single: true });
    },

    async countDocuments(filter = {}) {
      const rows = await this._scanAll();
      return rows.filter((entry) => matchesFilter(entry, filter)).length;
    },

    async exists(filter = {}) {
      const rows = await this._scanAll();
      return rows.some((entry) => matchesFilter(entry, filter));
    },

    async updateMany(filter = {}, update = {}) {
      const rows = await this._scanAll();
      const targets = rows.filter((entry) => matchesFilter(entry, filter));
      let modifiedCount = 0;
      for (const row of targets) {
        if (update.$set) {
          for (const [key, value] of Object.entries(update.$set)) {
            setValue(row, key, value);
          }
        }
        row.updatedAt = new Date().toISOString();
        await this._put(row);
        modifiedCount += 1;
      }
      return { modifiedCount };
    },

    async findOneAndUpdate(filter = {}, update = {}, optionsArg = {}) {
      let doc = await this.findOne(filter);
      if (!doc && optionsArg.upsert) {
        doc = await this.create({ ...filter, ...update });
      } else if (doc) {
        Object.assign(doc, update);
        await doc.save();
      }
      return doc;
    },

    async updateOne(filter = {}, update = {}, optionsArg = {}) {
      let doc = await this.findOne(filter);
      if (!doc && optionsArg.upsert) {
        const payload = { ...filter, ...(update.$setOnInsert ?? {}) };
        doc = await this.create(payload);
      } else if (doc && update.$set) {
        Object.assign(doc, update.$set);
        await doc.save();
      }
      return doc;
    },

    async deleteMany(filter = {}) {
      const rows = await this._scanAll();
      const targets = rows.filter((entry) => matchesFilter(entry, filter));
      let deletedCount = 0;
      for (const row of targets) {
        await dynamo.send(
          new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { pk: row.pk, sk: row.sk },
          }),
        );
        deletedCount += 1;
      }
      return { deletedCount };
    },

    async aggregate(pipeline = []) {
      const rows = await this._scanAll();
      return aggregateRows(rows, pipeline);
    },
  };

  registerModel(name, model);
  return model;
}
