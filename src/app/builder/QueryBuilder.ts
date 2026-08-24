

import { FilterQuery, Query } from 'mongoose';

class QueryBuilder<T> {
  public modelQuery: Query<T[], T>;
  public query: Record<string, unknown>;
  private cursorField?: string;
  private cursorLimit?: number;

  constructor(modelQuery: Query<T[], T>, query: Record<string, unknown>) {
    this.modelQuery = modelQuery;
    this.query = query;
  }

  search(searchableFields: string[]) {
    const searchTerm = this?.query?.searchTerm;
    if (searchTerm) {
      this.modelQuery = this.modelQuery.find({
        $or: searchableFields.map(
          (field) =>
            ({
              [field]: { $regex: searchTerm, $options: 'i' },
            }) as FilterQuery<T>,
        ),
      });
    }
    return this;
  }

  filter() {
    const queryObj = { ...this.query }; //copy
    // filtering
    const excludeFields = ['searchTerm', 'sort', 'limit', 'page', 'fields'];

    excludeFields.forEach((el) => delete queryObj[el]);

    this.modelQuery = this.modelQuery.find(queryObj as FilterQuery<T>);

    return this;
  }

  sort() {
    const sort =
      (this?.query?.sort as string)?.split(',')?.join(' ') || '-createdAt';
    this.modelQuery = this.modelQuery.sort(sort as string);
    return this;
  }

  paginate() {
    const page = Number(this?.query?.page) || 1;
    const limit = Number(this?.query?.limit) || 10;
    const skip = (page - 1) * limit;

    this.modelQuery = this.modelQuery.skip(skip).limit(limit);
    return this;
  }

  fields() {
    const fields =
      (this?.query?.fields as string)?.split(',')?.join(' ') || '-__v';

    this.modelQuery = this.modelQuery.select(fields);
    return this;
  }

  // keyset (cursor) pagination — fetches one page strictly older than `cursor` (an id/date
  // value of cursorField from the previous page's last item), sorted newest-first. Meant
  // for feeds like chat messages where offset pagination (skip/limit) would shift under
  // concurrent inserts. Call executeCursorPagination() to actually run the query.
  cursorPaginate(cursorField: string = '_id') {
    this.cursorField = cursorField;
    const cursor = this.query?.cursor as string | undefined;
    const limit = Number(this.query?.limit) || 20;

    if (cursor) {
      this.modelQuery = this.modelQuery.find({
        [cursorField]: { $lt: cursor },
      } as FilterQuery<T>);
    }

    this.modelQuery = this.modelQuery
      .sort({ [cursorField]: -1 } as Record<string, 1 | -1>)
      .limit(limit + 1);
    this.cursorLimit = limit;

    return this;
  }

  async executeCursorPagination() {
    const cursorField = this.cursorField ?? '_id';
    const limit = this.cursorLimit ?? 20;

    const docs = await this.modelQuery;
    const hasNextPage = docs.length > limit;
    const page = hasNextPage ? docs.slice(0, limit) : docs;
    const oldestInPage = page[page.length - 1] as any;
    const nextCursor = hasNextPage && oldestInPage ? oldestInPage[cursorField] : null;

    return {
      // sorted newest-first for the query itself, reversed here so callers render
      // oldest-to-newest (top-to-bottom chat order) without doing it themselves
      data: page.reverse(),
      meta: {
        limit,
        hasNextPage,
        nextCursor,
      },
    };
  }

  async countTotal() {
    const totalQuery = this.modelQuery.getFilter();
    const total = await this.modelQuery.model.countDocuments(totalQuery);
    const page = Number(this?.query?.page) || 1;
    const limit = Number(this?.query?.limit) || 10;
    const totalPage = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPage,
    };
  }
}

export default QueryBuilder;