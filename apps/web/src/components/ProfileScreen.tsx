import { useRef, useState, type ChangeEvent } from "react";

import type { AvatarId } from "../domain/records";
import { MainNav, type MainNavDestination } from "./MainNav";

interface ProfileScreenProps {
  username: string;
  profileImage: string;
  recordingAvatar: AvatarId;
  onUsernameChange: (username: string) => void;
  onProfileImageChange: (image: string) => void;
  onRecordingAvatarChange: (avatar: AvatarId) => void;
  onNavigate: (destination: Exclude<MainNavDestination, "profile">) => void;
}

const RECORDING_AVATARS = [
  { id: "none", label: "不遮挡", emoji: null },
  { id: "man", label: "男生", emoji: "👨" },
  { id: "woman", label: "女生", emoji: "👩" },
] as const satisfies readonly {
  id: AvatarId;
  label: string;
  emoji: string | null;
}[];

const MAX_PROFILE_IMAGE_BYTES = 1_500_000;

export function ProfileScreen({
  username,
  profileImage,
  recordingAvatar,
  onUsernameChange,
  onProfileImageChange,
  onRecordingAvatarChange,
  onNavigate,
}: ProfileScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState("");

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > MAX_PROFILE_IMAGE_BYTES) {
      setImageError("请选择小于 1.5 MB 的图片");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      onProfileImageChange(reader.result);
      setImageError("");
    };
    reader.onerror = () => setImageError("头像读取失败，请重试");
    reader.readAsDataURL(file);
  };

  return (
    <div className="profile-screen">
      <main className="profile-content" aria-labelledby="profile-title">
        <header className="profile-header">
          <h1 id="profile-title">个人</h1>
          <p>你的训练身份与录屏偏好</p>
        </header>

        <section className="profile-identity" aria-labelledby="identity-heading">
          <h2 id="identity-heading" className="sr-only">个人资料</h2>
          <button
            className="profile-photo"
            type="button"
            aria-label="更换头像"
            onClick={() => inputRef.current?.click()}
          >
            {profileImage ? (
              <img src={profileImage} alt="" />
            ) : (
              <span aria-hidden="true">{username.trim().slice(0, 1) || "练"}</span>
            )}
            <small>更换</small>
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={handleImage}
          />
          <label className="profile-name">
            <span>用户名</span>
            <input
              type="text"
              value={username}
              maxLength={16}
              autoComplete="nickname"
              placeholder="输入用户名"
              onChange={(event) => onUsernameChange(event.currentTarget.value)}
            />
          </label>
        </section>
        {imageError ? <p className="profile-error" role="alert">{imageError}</p> : null}

        <section className="profile-setting" aria-labelledby="recording-avatar-heading">
          <div>
            <h2 id="recording-avatar-heading">录屏头像</h2>
            <p>训练录像中用 Emoji 遮挡面部，仅影响之后的录屏。</p>
          </div>
          <div className="recording-avatar-options" role="radiogroup" aria-label="选择录屏头像">
            {RECORDING_AVATARS.map((option) => (
              <button
                className="recording-avatar-option"
                data-selected={recordingAvatar === option.id ? "true" : "false"}
                type="button"
                role="radio"
                aria-checked={recordingAvatar === option.id}
                key={option.id}
                onClick={() => onRecordingAvatarChange(option.id)}
              >
                <span aria-hidden="true">{option.emoji ?? "○"}</span>
                <small>{option.label}</small>
              </button>
            ))}
          </div>
        </section>

        <p className="profile-privacy">头像、用户名和训练录像都只保存在当前设备。</p>
      </main>

      <MainNav
        active="profile"
        onNavigate={(destination) => {
          if (destination !== "profile") onNavigate(destination);
        }}
      />
    </div>
  );
}
