import { PipelineStage } from "mongoose";
import SnapperProfile from "./snapperProfile.model";
import { AdminApprovalStatus, UserRole } from "../user/user.interface";
import { availabilityService } from "../availability/availability.service";
import { packageService } from "../package/package.service";

interface IGetVerifiedSnappersQuery {
  page?: number;
  limit?: number;
  search?: string;
  specialty?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  minHourlyRate?: number;
  maxHourlyRate?: number;
}

const getVerifiedSnappers = async (
  query: IGetVerifiedSnappersQuery,
) => {
  const {
    page = 1,
    limit = 12,
    search,
    specialty,
    sortBy = "averageRating",
    sortOrder = "desc",
    minHourlyRate,
    maxHourlyRate,
  } = query;

  const skip = (page - 1) * limit;

  const pipeline: PipelineStage[] = [];


  /**
   * Join User with SnapperProfile
   */
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      as: "user",
    },
  });

  pipeline.push({
    $unwind: "$user",
  });

  /**
   * Only:
   * - SNAPPER users
   * - Admin approved users
   * - Active users
   * - Not deleted users
   */
  pipeline.push({
    $match: {
      "user.role": UserRole.SNAPPER,
      "user.adminApproval": AdminApprovalStatus.APPROVED,
      "user.status": "active",
      "user.isDeleted": { $ne: true },
    },
  });

  /**
   * Search
   *
   * Searches:
   * - fullName
   * - address
   * - email
   * - phoneNumber
   */
  if (search?.trim()) {
    const searchRegex = new RegExp(search.trim(), "i");

    pipeline.push({
      $match: {
        $or: [
          { "user.fullName": searchRegex },
          { "user.address": searchRegex },
          { "user.email": searchRegex },
          { "user.phoneNumber": searchRegex },
        ],
      },
    });
  }

  /**
   * Specialty/category filter
   *
   * Example:
   * ?specialty=Wedding
   *
   * Or:
   * ?specialty=Wedding,Portrait
   */
  if (specialty?.trim()) {
    const specialties = specialty
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    pipeline.push({
      $match: {
        specialties: {
          $in: specialties.map(
            (item) => new RegExp(`^${item}$`, "i"),
          ),
        },
      },
    });
  }

  /**
   * Hourly rate filter
   */
  if (
    minHourlyRate !== undefined ||
    maxHourlyRate !== undefined
  ) {
    const hourlyRateFilter: Record<string, number> = {};

    if (minHourlyRate !== undefined) {
      hourlyRateFilter.$gte = minHourlyRate;
    }

    if (maxHourlyRate !== undefined) {
      hourlyRateFilter.$lte = maxHourlyRate;
    }

    pipeline.push({
      $match: {
        hourlyRate: hourlyRateFilter,
      },
    });
  }

  /**
   * Sorting
   *
   * Default:
   * highest rated first
   */
  const allowedSortFields: Record<string, string> = {
    averageRating: "user.averageRating",
    totalReview: "user.totalReview",
    hourlyRate: "hourlyRate",
    fullName: "user.fullName",
    createdAt: "createdAt",
  };

  const sortField =
    allowedSortFields[sortBy] ||
    allowedSortFields.averageRating;

  const sortDirection = sortOrder === "asc" ? 1 : -1;

  pipeline.push({
    $sort: {
      [sortField]: sortDirection,
      "user.totalReview": -1,
      _id: 1,
    },
  });

pipeline.push({
  $facet: {
    meta: [
      {
        $count: "total",
      },
    ],

    data: [
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },

      // latest 10 (non-deleted) portfolio images for this snapper
      {
        $lookup: {
          from: "portfolios",
          let: { snapperUserId: "$userId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$userId", "$$snapperUserId"] },
                    { $eq: ["$isDeleted", false] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            {
              $project: {
                image: 1,
                category: 1,
                place: 1,
                clickedAt: 1,
                createdAt: 1,
              },
            },
          ],
          as: "recentPortfolio",
        },
      },

      // latest 10 reviews received by this snapper, with basic reviewer info attached
      {
        $lookup: {
          from: "reviews",
          let: { snapperUserId: "$userId" },
          pipeline: [
            { $match: { $expr: { $eq: ["$receiverId", "$$snapperUserId"] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: "users",
                localField: "reviewerId",
                foreignField: "_id",
                as: "reviewer",
              },
            },
            { $unwind: { path: "$reviewer", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                comment: 1,
                rating: 1,
                createdAt: 1,
                "reviewer._id": 1,
                "reviewer.fullName": 1,
                "reviewer.profileImage": 1,
              },
            },
          ],
          as: "recentReviews",
        },
      },

      {
        $project: {
          _id: 1,

          // User fields
          "user._id": 1,
          "user.fullName": 1,
          "user.email": 1,
          "user.role": 1,
          "user.profileImage": 1,
          "user.coverPhoto": 1,
          "user.address": 1,
          "user.socialLinks": 1,
          "user.totalReview": 1,
          "user.averageRating": 1,
          "user.status": 1,
          "user.adminApproval": 1,

          // SnapperProfile fields
          about: 1,
          specialties: 1,
          hourlyRate: 1,
          badges: 1,

          // related content
          recentPortfolio: 1,
          recentReviews: 1,
        },
      },
    ],
  },
});

  const [result] = await SnapperProfile.aggregate(pipeline);

  const total = result?.meta?.[0]?.total || 0;

  return {
    data: result?.data || [],
    meta: {
      page,
      limit,
      total,
      totalPage: Math.ceil(total / limit),
    },
  };
};

// combined read for a snapper's booking page: their weekly availability plus the
// (active, publicly-offered) packages they sell — each already validates the target
// is a real snapper, so both run in parallel rather than duplicating that check here
const getAvailabilityAndPackages = async (userId: string) => {
  const [availability, packages] = await Promise.all([
    availabilityService.getSpecificUserAvailability(userId),
    // a snapper realistically has a handful of packages, not pages of them —
    // fetch them all rather than defaulting to QueryBuilder's 10-item page size
    packageService.getSpecificUserPackages(userId, { limit: 100 }),
  ]);

  return {
    availability,
    packages: packages.result,
  };
};

export const snapperProfileService = {
  getVerifiedSnappers,
  getAvailabilityAndPackages,
};