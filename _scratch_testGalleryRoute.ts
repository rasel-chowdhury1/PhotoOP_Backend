import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import config from './src/app/config';
import { User } from './src/app/modules/user/user.model';
import Package from './src/app/modules/package/package.model';
import Booking from './src/app/modules/booking/booking.model';
import Gallery from './src/app/modules/gallery/gallery.model';
import { bookingService } from './src/app/modules/booking/booking.service';
import { BookingStatus } from './src/app/modules/booking/booking.interface';

async function main() {
  await mongoose.connect(config.database_url as string);

  const snapper = await User.findOne({ role: 'snapper', adminApproval: 'approved', status: 'active' });
  const customer = await User.findOne({ role: 'user' });
  const other = await User.findOne({ role: 'user', _id: { $ne: customer!._id } });
  const pkg = await Package.findOne({ userId: snapper!._id, isDeleted: false });

  const booking = await Booking.create({
    bookingId: `TEST-ROUTE-${Date.now()}`,
    userId: customer!._id, snapperId: snapper!._id, packageId: pkg!._id,
    fullName: 'Route Test Customer', email: 'routetest@example.com', phoneNumber: '+1', location: 'x',
    bookingDate: new Date(), startTime: '10:00', endTime: '11:00',
    packagePrice: pkg!.price, addOnPrice: 0, serviceFeePercentage: 5, serviceFee: 3, totalPrice: pkg!.price + 3,
    status: BookingStatus.PENDING,
    statusHistory: [],
  });

  // walk it to ACCEPTED (should auto-create gallery with default name) then SHOOT_COMPLETED
  await bookingService.updateBookingStatus(booking._id.toString(), snapper!._id.toString(), false, BookingStatus.ACCEPTED);
  const galleryAfterAccept = await Gallery.findOne({ bookingId: booking._id });
  console.log('gallery auto-created on ACCEPTED:', !!galleryAfterAccept, 'name:', galleryAfterAccept?.name);

  await bookingService.updateBookingStatus(booking._id.toString(), snapper!._id.toString(), false, BookingStatus.UPCOMING);
  await bookingService.updateBookingStatus(booking._id.toString(), snapper!._id.toString(), false, BookingStatus.SHOOT_COMPLETED);

  const snapperToken = jwt.sign({ userId: snapper!._id.toString(), role: 'snapper', email: snapper!.email }, config.jwt_access_secret as string, { expiresIn: '1h' });
  const customerToken = jwt.sign({ userId: customer!._id.toString(), role: 'user', email: customer!.email }, config.jwt_access_secret as string, { expiresIn: '1h' });
  const otherToken = jwt.sign({ userId: other!._id.toString(), role: 'user', email: other!.email }, config.jwt_access_secret as string, { expiresIn: '1h' });

  console.log(JSON.stringify({
    bookingId: booking._id.toString(),
    galleryId: galleryAfterAccept!._id.toString(),
    snapperToken, customerToken, otherToken,
  }, null, 2));

  await mongoose.disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
