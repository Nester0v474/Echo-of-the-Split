import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, isPhoneLayout } from '../config/constants';
import { BATTLE_BACKGROUNDS, BattleBackground } from '../config/backgrounds';
import { STR } from '../config/strings';
import { markGameReady } from '../platform/yandex';
import { ensureMusic, loadAudio, playSfx } from '../systems/Audio';
import { FONT, makeButton } from '../ui/UiKit';
import { hideRules, showRules } from '../ui/RulesOverlay';
import { hideBattleChrome } from '../ui/BattleChrome';
import { hideBattleEnd } from '../ui/BattleEndOverlay';
import { hideCampaignChrome } from '../ui/CampaignChrome';
import { SettingsPanel } from '../ui/SettingsPanel';

export class MenuScene extends Phaser.Scene {
  private settings!: SettingsPanel;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    hideBattleChrome();
    hideBattleEnd();
    hideCampaignChrome();
    hideRules();
    document.getElementById('battle-tutorial')?.remove();
    const bg = BATTLE_BACKGROUNDS[BattleBackground.ASTEROIDS];
    if (this.textures.exists(bg.key)) {
      this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, bg.key).setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    } else {
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x070a14);
    }
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x04070e, 0.45);

    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const phone = isPhoneLayout();

    this.add
      .text(cx, cy - (phone ? 168 : 200), STR.gameTitle, {
        fontFamily: FONT,
        fontSize: phone ? '54px' : '84px',
        fontStyle: 'bold',
        color: '#e8f4ff',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy - (phone ? 56 : 40), STR.menuTagline.join('\n'), {
        fontFamily: FONT,
        fontSize: phone ? '16px' : '22px',
        color: '#cfe3ff',
        align: 'center',
        lineSpacing: 8,
      })
      .setOrigin(0.5);

    makeButton(this, cx, cy + (phone ? 64 : 100), phone ? 300 : 360, 54, STR.menuCampaign, 0x1f7a4a, () => {
      playSfx('ui');
      this.scene.start('CampaignScene');
    });
    makeButton(this, cx, cy + (phone ? 126 : 164), phone ? 300 : 360, 50, STR.menuQuickBattle, 0x2a4f8a, () => {
      playSfx('ui');
      this.scene.start('BattleScene', {});
    });
    makeButton(this, cx, cy + (phone ? 186 : 226), phone ? 300 : 360, 50, STR.menuRules, 0x3f3f46, () => {
      playSfx('ui');
      showRules();
    });
    makeButton(this, cx, cy + (phone ? 246 : 288), phone ? 300 : 360, 50, STR.menuSettings, 0x2a3042, () => {
      playSfx('ui');
      this.settings.show();
    });

    this.settings = new SettingsPanel(this);
    void loadAudio().then(() => ensureMusic());
    markGameReady();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => hideRules());
  }
}
