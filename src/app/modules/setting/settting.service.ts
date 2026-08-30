import  Settings, { ISettings } from "./setting.model";


// Get the settings
const getSettingsByKey = async (payload: {key: 'privacy_policy' | 'term_condition' | 'about_us'; role: 'user' | 'snapper' }): Promise<ISettings | null> => {
    return await Settings.findOne(payload).sort({ createdAt: -1 });
};

// Create or update the privacy policy
const updateSettingsByKey = async (key: string, role: string, content: string): Promise<ISettings> => {
    let policy = await Settings.findOne({key, role});
    if (!policy) {
        policy = new Settings({key, role, content });
    } else {
        policy.content = content;
    }
    return await policy.save();
};

export const settingsService = {
    getSettingsByKey,
    updateSettingsByKey
};
