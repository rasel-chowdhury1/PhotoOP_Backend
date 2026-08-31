import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging, Message } from "firebase-admin/messaging";
import User from "../modules/user/user.model";

const serviceAccount = require("../../../googleFirebaseAdmin.json");

initializeApp({
  credential: cert(serviceAccount),
});

export const sendNotificationByFcmToken = async (
  receiverId: any,
  textMessage: string,
  titleName?: string
): Promise<void> => {
  console.log({ receiverId, textMessage });

  const findUser = await User.findOne({ _id: receiverId });

  console.log({ findUser });

  if (!findUser) {
    console.log(`User with id ${receiverId} not found`);
    return;
  }

  const { fcmToken } = findUser;

  if (!fcmToken?.trim()) {
    console.log(`No valid FCM token found for user: ${receiverId}`);
    return;
  }

  const message: Message = {
    notification: {
      title: titleName || "PhotoOP",
      body: textMessage,
    },
    token: fcmToken,
  };

  try {
    const response = await getMessaging().send(message);

    console.log("Successfully sent message:", response);
  } catch (error) {
    console.log("Error sending message:", error);
  }
};