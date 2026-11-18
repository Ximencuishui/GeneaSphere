import { ReviewStatus } from '@prisma/client';
import { coverMediaWhere, publicMediaWhere } from './media-visibility';

describe('publicMediaWhere', () => {
  it('hides pending and rejected reviews and keeps legacy rows without a review', () => {
    expect(publicMediaWhere(3n, { taken_year: 1980 })).toEqual({
      clan_id: 3n,
      deleted_at: null,
      taken_year: 1980,
      NOT: {
        reviews: {
          some: { status: { in: [ReviewStatus.PENDING, ReviewStatus.REJECTED] } },
        },
      },
    });
  });
});

describe('coverMediaWhere', () => {
  it('keeps covers in the current clan and hides pending or rejected reviews', () => {
    expect(coverMediaWhere(3n)).toEqual({
      clan_id: 3n,
      deleted_at: null,
      is_cover: true,
      NOT: {
        reviews: {
          some: { status: { in: [ReviewStatus.PENDING, ReviewStatus.REJECTED] } },
        },
      },
    });
  });
});
