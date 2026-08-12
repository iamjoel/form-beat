type RecordingAvatarId = "none" | "man" | "woman";

interface SavedProfile {
  username: string;
  profileImage: string;
  recordingAvatar: RecordingAvatarId;
}

interface ProfilePageData extends SavedProfile {
  profileInitial: string;
  recordingOptions: readonly {
    id: RecordingAvatarId;
    label: string;
    emoji: string;
  }[];
}

interface ProfilePageInstance {
  data: ProfilePageData;
  setData(data: Partial<ProfilePageData>): void;
  persist(next: Partial<SavedProfile>): void;
}

const PROFILE_STORAGE_KEY = "workout-detect:profile:v1";
const RECORDING_OPTIONS = [
  { id: "none", label: "不遮挡", emoji: "○" },
  { id: "man", label: "男生", emoji: "👨" },
  { id: "woman", label: "女生", emoji: "👩" },
] as const;

function readProfile(): SavedProfile {
  const stored = wx.getStorageSync(PROFILE_STORAGE_KEY) as Partial<SavedProfile> | null;
  const recordingAvatar =
    stored?.recordingAvatar === "man" || stored?.recordingAvatar === "woman"
      ? stored.recordingAvatar
      : "none";
  return {
    username: typeof stored?.username === "string" ? stored.username.slice(0, 16) : "训练者",
    profileImage: typeof stored?.profileImage === "string" ? stored.profileImage : "",
    recordingAvatar,
  };
}

const initialProfile = readProfile();

Page({
  data: {
    ...initialProfile,
    profileInitial: initialProfile.username.trim().slice(0, 1) || "练",
    recordingOptions: RECORDING_OPTIONS,
  } satisfies ProfilePageData,

  onShow(this: ProfilePageInstance) {
    const profile = readProfile();
    this.setData({
      ...profile,
      profileInitial: profile.username.trim().slice(0, 1) || "练",
    });
  },

  persist(this: ProfilePageInstance, next: Partial<SavedProfile>) {
    const profile: SavedProfile = {
      username: next.username ?? this.data.username,
      profileImage: next.profileImage ?? this.data.profileImage,
      recordingAvatar: next.recordingAvatar ?? this.data.recordingAvatar,
    };
    wx.setStorageSync(PROFILE_STORAGE_KEY, profile);
    this.setData({
      ...profile,
      profileInitial: profile.username.trim().slice(0, 1) || "练",
    });
  },

  chooseAvatar(
    this: ProfilePageInstance,
    event: MiniProgramEvent<{ avatarUrl: string }>,
  ) {
    const tempFilePath = event.detail.avatarUrl;
    if (!tempFilePath) return;
    const previousImage = this.data.profileImage;
    wx.getFileSystemManager().saveFile({
      tempFilePath,
      success: ({ savedFilePath }) => {
        this.persist({ profileImage: savedFilePath });
        if (previousImage && previousImage !== savedFilePath) {
          wx.getFileSystemManager().unlink({
            filePath: previousImage,
            success: () => undefined,
            fail: () => undefined,
          });
        }
      },
      fail: () => wx.showToast({ title: "头像保存失败", icon: "none" }),
    });
  },

  changeUsername(
    this: ProfilePageInstance,
    event: MiniProgramEvent<{ value: string }>,
  ) {
    this.persist({ username: event.detail.value.slice(0, 16) });
  },

  changeRecordingAvatar(this: ProfilePageInstance, event: MiniProgramEvent) {
    const id = String(event.currentTarget.dataset.id ?? "");
    if (id !== "none" && id !== "man" && id !== "woman") return;
    this.persist({ recordingAvatar: id });
  },

  openFitness() {
    wx.redirectTo({ url: "/pages/records/index" });
  },

  openWorkout() {
    wx.redirectTo({ url: "/pages/setup/index" });
  },
});
