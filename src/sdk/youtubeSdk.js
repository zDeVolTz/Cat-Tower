/**
 * YouTube Playables SDK Integration Layer
 * Reference: https://developers.google.com/youtube/gaming/playables/reference/sdk
 */

const InPlayables = typeof window !== "undefined" && typeof window.ytgame !== "undefined";

export const Platform = {
  firstFrameReady() {
    if (InPlayables) {
      try {
        window.ytgame.game.firstFrameReady();
      } catch (e) {
        console.warn("ytgame.game.firstFrameReady failed:", e);
      }
    }
  },

  gameReady() {
    if (InPlayables) {
      try {
        window.ytgame.game.gameReady();
      } catch (e) {
        console.warn("ytgame.game.gameReady failed:", e);
      }
    }
  },

  isAudioEnabled() {
    if (InPlayables) {
      try {
        return window.ytgame.system.isAudioEnabled();
      } catch (e) {
        return true;
      }
    }
    return true;
  },

  sendScore(score) {
    if (InPlayables) {
      try {
        window.ytgame.engagement.sendScore({ score });
      } catch (e) {
        console.warn("ytgame.engagement.sendScore failed:", e);
      }
    }
  },

  saveData(data) {
    const json = JSON.stringify(data);
    if (InPlayables) {
      try {
        window.ytgame.game.saveData(json);
        return;
      } catch (e) {
        console.warn("ytgame.game.saveData failed, falling back to localStorage:", e);
      }
    }
    try {
      localStorage.setItem("catTowerSave", json);
    } catch (e) {}
  },

  async loadData() {
    if (InPlayables) {
      try {
        const raw = await window.ytgame.game.loadData();
        if (raw) return JSON.parse(raw);
      } catch (e) {
        console.warn("ytgame.game.loadData failed, trying localStorage fallback:", e);
      }
    }
    try {
      const raw = localStorage.getItem("catTowerSave");
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return null;
  }
};
