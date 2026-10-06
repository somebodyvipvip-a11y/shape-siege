import { CHARACTERS, CONFIG, ELEMENT_NAMES, GENERIC_SKILLS, SKILLS } from './config';
import type { Element, GameState, SkillId, UpgradeChoice } from './types';

export class Progression {
  constructor(private state: GameState, private random: () => number) {}

  addXp(value: number): void {
    const s = this.state;
    s.xp += Math.max(0, value);
    while (s.xp >= s.xpRequired) {
      s.xp -= s.xpRequired;
      s.level++;
      s.pendingUpgrades++;
      s.xpRequired = 10 + 5 * (s.level - 1);
    }
    if (s.pendingUpgrades && !s.choices.length) this.roll();
  }
  reward(): void {
    this.state.pendingUpgrades++;
    if (!this.state.choices.length) this.roll();
  }
  candidates(): UpgradeChoice[] {
    const p = this.state.player;
    const pool: UpgradeChoice[] = [];
    if (p.skills.length < CONFIG.autoSlots) {
      for (const id of GENERIC_SKILLS) if (!p.skills.some(s => s.id === id)) {
        pool.push({ id: `new:${id}`, kind: 'new', skillId: id, name: SKILLS[id].name, description: `获得新技能：基础伤害 ${SKILLS[id].damage}，冷却 ${SKILLS[id].cooldown} 秒` });
      }
    }
    for (const skill of p.skills) {
      const label = SKILLS[skill.id].name;
      if (skill.level < CONFIG.skillMaxLevel) pool.push({ id: `level:${skill.id}`, kind: 'level', skillId: skill.id, currentLevel: skill.level, name: `${label}升级`, description: `升至 ${skill.level + 1} 级，基础伤害增加 12%，数量、范围或冷却随等级强化` });
      if (skill.level >= 3 && skill.elements.length === 0) {
        for (const element of ['fire', 'ice', 'lightning'] as Element[]) {
          const detail = element === 'fire' ? '附带持续 2 秒、每秒直接伤害 15% 的燃烧' : element === 'ice' ? '命中减速 25%，持续 2 秒' : '向 120 范围内最多 2 个目标传导 30% 伤害';
          pool.push({ id: `element:${skill.id}:${element}`, kind: 'element', skillId: skill.id, element, name: `${label}·${ELEMENT_NAMES[element]}`, description: detail });
        }
      }
      if (skill.level >= 5 && !skill.enhanced) pool.push({ id: `behavior:${skill.id}`, kind: 'behavior', skillId: skill.id, name: `${label}行为强化`, description: SKILLS[skill.id].behavior });
      if (skill.level >= 7 && skill.elements.length === 1) {
        for (const element of ['fire', 'ice', 'lightning'] as Element[]) if (element !== skill.elements[0]) {
          const pair = [...skill.elements, element];
          const name = pair.includes('fire') && pair.includes('ice') ? '热冲击' : pair.includes('fire') ? '电燃' : '冰链';
          pool.push({ id: `fusion:${skill.id}:${element}`, kind: 'fusion', skillId: skill.id, element, name: `${label}·${name}`, description: `${ELEMENT_NAMES[skill.elements[0]]}＋${ELEMENT_NAMES[element]} 融合，替代基础元素效果` });
        }
      }
    }
    pool.push({ id: 'stat:health', kind: 'stat', name: '生命强化', description: '最大生命与当前生命增加 15' });
    pool.push({ id: 'stat:pickup', kind: 'stat', name: '拾取强化', description: '经验吸取范围增加 20' });
    if (p.speedBonus < CONFIG.speedBonusCap) pool.push({ id: 'stat:speed', kind: 'stat', name: '移动强化', description: '移动速度增加 5%，最高增加 30%' });
    if (p.cooldownReduction < CONFIG.cooldownCap) pool.push({ id: 'stat:cooldown', kind: 'stat', name: '冷却强化', description: '冷却缩减增加 5%，最高 40%' });
    if (p.critChance < CONFIG.critCap) pool.push({ id: 'stat:crit', kind: 'stat', name: '暴击强化', description: `暴击率增加 8%，最高 ${Math.round(CONFIG.critCap * 100)}%` });
    if (p.critMultiplier < CONFIG.critMultCap) pool.push({ id: 'stat:critDamage', kind: 'stat', name: '暴击伤害', description: `暴击倍率增加 0.1，最高 ${CONFIG.critMultCap}×` });
    if (p.dodge < CONFIG.dodgeCap) pool.push({ id: 'stat:dodge', kind: 'stat', name: '闪避强化', description: `接触伤害闪避增加 5%，最高 ${Math.round(CONFIG.dodgeCap * 100)}%` });
    if (p.armor < CONFIG.armorCap) pool.push({ id: 'stat:armor', kind: 'stat', name: '护甲强化', description: `受到的所有伤害减少 2，最高 ${CONFIG.armorCap}` });
    if (p.hp < p.maxHp) pool.push({ id: 'stat:heal', kind: 'stat', name: '生命恢复', description: '恢复最大生命的 15%' });
    pool.push({ id: 'stat:damage', kind: 'stat', name: '伤害强化', description: '所有直接伤害增加 3%' });
    return pool;
  }
  roll(): void {
    const pool = this.candidates();
    const choices: UpgradeChoice[] = [];
    while (choices.length < 3 && pool.length) {
      const index = Math.floor(this.random() * pool.length);
      choices.push(pool.splice(index, 1)[0]);
    }
    while (choices.length < 3) choices.push({ id: `stat:damage:${choices.length}`, kind: 'stat', name: '伤害强化', description: '所有直接伤害增加 3%' });
    this.state.choices = choices;
  }
  choose(id: string): boolean {
    const s = this.state, p = s.player;
    const choice = s.choices.find(c => c.id === id);
    if (s.result || !s.pendingUpgrades || !choice) return false;
    const skill = p.skills.find(sk => sk.id === choice.skillId);
    if (choice.kind === 'new') {
      if (p.skills.length >= CONFIG.autoSlots || !choice.skillId) return false;
      p.skills.push({ id: choice.skillId, level: 1, cooldown: 0, elements: [], enhanced: false });
    } else if (choice.kind === 'level' && skill) skill.level++;
    else if ((choice.kind === 'element' || choice.kind === 'fusion') && skill && choice.element) skill.elements.push(choice.element);
    else if (choice.kind === 'behavior' && skill) skill.enhanced = true;
    else if (choice.id === 'stat:health') { p.maxHp += 15; p.hp += 15; }
    else if (choice.id === 'stat:speed') {
      p.speedBonus = Math.min(CONFIG.speedBonusCap, p.speedBonus + .05);
      p.speed = CHARACTERS[p.characterId].speed * (1 + p.speedBonus);
    } else if (choice.id === 'stat:pickup') p.pickupRadius += 20;
    else if (choice.id === 'stat:cooldown') p.cooldownReduction = Math.min(CONFIG.cooldownCap, p.cooldownReduction + .05);
    else if (choice.id === 'stat:crit') p.critChance = Math.min(CONFIG.critCap, p.critChance + .08);
    else if (choice.id === 'stat:critDamage') p.critMultiplier = Math.min(CONFIG.critMultCap, p.critMultiplier + .1);
    else if (choice.id === 'stat:dodge') p.dodge = Math.min(CONFIG.dodgeCap, p.dodge + .05);
    else if (choice.id === 'stat:armor') p.armor = Math.min(CONFIG.armorCap, p.armor + 2);
    else if (choice.id === 'stat:heal') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * .15);
    else p.damageBonus += .03;
    s.pendingUpgrades--;
    s.choices = [];
    if (s.pendingUpgrades) this.roll();
    return true;
  }
  reroll(): boolean {
    if (this.state.result || !this.state.pendingUpgrades || this.state.rerolls <= 0) return false;
    this.state.rerolls--;
    this.roll();
    return true;
  }
  /** 每关通关的大礼包奖池，独立于升级卡；沿用升级随机流，保持与战斗随机独立。 */
  giftCandidates(): UpgradeChoice[] {
    const p = this.state.player, pool: UpgradeChoice[] = [];
    pool.push({ id: 'gift:heal', kind: 'stat', name: '满血强化', description: '生命完全恢复，且生命上限增加 20' });
    pool.push({ id: 'gift:damage', kind: 'stat', name: '伤害增幅', description: '所有直接伤害增加 12%' });
    if (p.cooldownReduction < CONFIG.cooldownCap) pool.push({ id: 'gift:cooldown', kind: 'stat', name: '冷却增幅', description: '冷却缩减增加 8%' });
    pool.push({ id: 'gift:pickup', kind: 'stat', name: '拾取增幅', description: '经验吸取范围增加 50' });
    if (p.speedBonus < CONFIG.speedBonusCap) pool.push({ id: 'gift:speed', kind: 'stat', name: '疾行增幅', description: '移动速度增加 8%' });
    if (p.dodge < CONFIG.dodgeCap) pool.push({ id: 'gift:dodge', kind: 'stat', name: '闪避增幅', description: '接触伤害闪避增加 5%' });
    if (p.armor < CONFIG.armorCap) pool.push({ id: 'gift:armor', kind: 'stat', name: '护甲增幅', description: '受到的所有伤害减少 3' });
    if (p.critChance < CONFIG.critCap) pool.push({ id: 'gift:crit', kind: 'stat', name: '暴击增幅', description: '暴击率增加 8%' });
    if (p.skills.some(s => s.level < CONFIG.skillMaxLevel)) pool.push({ id: 'gift:skill', kind: 'stat', name: '技能跃升', description: '随机一个已拥有技能 +1 级' });
    pool.push({ id: 'gift:reroll', kind: 'stat', name: '重抽储备', description: '本局重抽次数 +1' });
    return pool;
  }
  rollGift(): UpgradeChoice[] {
    const pool = this.giftCandidates(), choices: UpgradeChoice[] = [];
    while (choices.length < 3 && pool.length) choices.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0]);
    return choices;
  }
  chooseGift(id: string): boolean {
    const s = this.state, p = s.player;
    const choice = s.gift.find(c => c.id === id);
    if (s.result || !choice || !s.gift.length) return false;
    if (choice.id === 'gift:heal') { p.maxHp += 20; p.hp = p.maxHp; }
    else if (choice.id === 'gift:damage') p.damageBonus += .12;
    else if (choice.id === 'gift:cooldown') p.cooldownReduction = Math.min(CONFIG.cooldownCap, p.cooldownReduction + .08);
    else if (choice.id === 'gift:pickup') p.pickupRadius += 50;
    else if (choice.id === 'gift:speed') {
      p.speedBonus = Math.min(CONFIG.speedBonusCap, p.speedBonus + .08);
      p.speed = CHARACTERS[p.characterId].speed * (1 + p.speedBonus);
    } else if (choice.id === 'gift:dodge') p.dodge = Math.min(CONFIG.dodgeCap, p.dodge + .05);
    else if (choice.id === 'gift:armor') p.armor = Math.min(CONFIG.armorCap, p.armor + 3);
    else if (choice.id === 'gift:crit') p.critChance = Math.min(CONFIG.critCap, p.critChance + .08);
    else if (choice.id === 'gift:skill') {
      const upgradable = p.skills.filter(s => s.level < CONFIG.skillMaxLevel);
      if (upgradable.length) upgradable[Math.floor(this.random() * upgradable.length)].level++;
    } else if (choice.id === 'gift:reroll') s.rerolls++;
    s.gift = [];
    return true;
  }
}

export function skillDamage(state: GameState, id: SkillId): number {
  const skill = state.player.skills.find(s => s.id === id);
  return SKILLS[id].damage * (1 + CONFIG.baseDamageGrowth * ((skill?.level ?? 1) - 1)) * (1 + state.player.damageBonus);
}
