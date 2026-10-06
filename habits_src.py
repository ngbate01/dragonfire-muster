# Our own one-line summaries of each dragon's five habits (2, 4, 6, 8, 10 stars).
# Merged into catalog.json by: python habits_src.py
import json

H = {
"Syrax":["Intelligence and Instinct up for all allies","Initiative up for allies, down for enemies","Command heals more (more vs Slowed) and may grant Resistance","Boosts ally tactical (left) and fire (right) damage","Chance to cleanse an ally's negatives and control"],
"Vhagar":["Takes less physical and tactical damage early, more healing later","Boosts a right-flank ally's physical damage","Grants Advantage to an ally and may Weaken an enemy","Enemies take more fire (left) and physical (right) damage","Stacking Strength and toughness, with a big hit at 3+ stacks"],
"Caraxes":["Lowers Strength and Initiative of all enemies","Raises his own fire damage","Chance to Slow and Burn all enemies","Lowers enemy physical damage","More fire vs weakened enemies, heals when an enemy retreats"],
"Seasmoke":["Big Intelligence and Initiative boost to one ally","Initiative up for all allies","Cuts enemy healing, adds physical hits (double vs Panic)","Intelligence up, fire damage up for adjacent allies","Advantage to healthy allies, Resistance to hurt ones"],
"Crimson":["Lowers a tactical enemy's tactical damage","Takes less damage, Intelligence up","Chance to Weaken an enemy (higher with Taunt)","More damage vs healthy enemies, less healing for hurt ones","Command lowers enemy stats and gains a Stun"],
"Kalspire":["Strength and Instinct up","Lowers enemy Strength and Intelligence","Command hits harder and may Panic two enemies","Takes less damage, Instinct up","Brief huge damage reduction, weakens the top enemy damage dealers"],
"Malachite":["Chance to boost allies' physical damage and tactical defense","Instinct and healing up","Chance to grant Advantage to two allies","Strength up for all allies","Chance to grant an ally First Strike, Double Strike and Strength"],
"Venator":["Cuts an enemy's Intelligence (prefers Hunters)","Raises his own physical damage","Command adds a hit, Double Strike chance on even rounds","The opposing enemy takes more physical damage","Big hit and Overwhelm when below half troops"],
"Sheepstealer":["Stacking fire damage, bonus vs beasts","Intelligence up, lowers enemy Instinct","Makes Prey Vulnerable and may cleanse","Evasion, and cuts enemy healing","Big fire damage and healing, more with Prey"],
"Sunfyre":["Boosts the ally with the most troops, more as he weakens","Cuts a fire enemy's fire damage","Tactical hit and Intelligence cut vs fire enemies","Takes less fire damage, cleanses Vulnerable","Reacts to damage type: heals, buffs allies, or debuffs enemies"],
"Vermithor":["Weakens enemy Warriors and Hunters, takes more tactical damage","Takes less damage, Initiative up","Command hits harder and Protects allies","Cuts damage from enemy Warriors and Hunters","Big revenge hits when below half troops"],
"Moondancer":["Extra Rising Tide stacks (double with Advantage), buffs his Sentinel","Boosts the ally with the highest Instinct","Command hits harder at 4+ stacks, more stacks late","More physical damage and Bleed at high stacks","Cuts the top enemy's damage, stronger at 6+ stacks"],
"Daemoros":["Lowers an enemy's stats and Panics them","Strength and Initiative up","Chance to Confuse an enemy","Lowers another enemy's stats and Panics them","Takes less damage of every type"],
"Feskar":["Stacking physical defense for himself and an ally","Instinct up for all allies","Command adds fire damage (more vs Burn)","Intelligence and Initiative up","Chance to Stagger an enemy"],
"Rhysarion":["Cuts all damage early, heals allies from round 4","Strength and Intelligence up","Command heals two allies more","Allies receive more healing","Initiative and Resistance for an adjacent ally"],
"Shadowsong":["Lowers two enemies' Instinct and Initiative","Enemies take more fire and physical damage","Chance to make enemies Vulnerable (higher vs Panic)","Takes less damage, Intelligence up","Command hits much harder and Burns"],
"Tashix":["Lowers a tactical enemy's tactical damage","Intelligence up, lowers enemy Instinct","Stacking fire damage, Weakens enemies at 4+ stacks","Lowers all enemies' Instinct and Initiative","More stacking fire, huge hit at 7+ stacks"],
"Vaeldra":["Takes less damage, Strength up","Lowers two enemies' Instinct and Initiative","Taunted enemies take more damage","Boosts ally fire (left) and physical (right) damage","Physical defense and a chance to Taunt all enemies"],
"Velar":["Boosts the Vanguard's tactical damage","Instinct and Initiative up","Chance of First Strike for allies and Slow on enemies","Strength and Instinct up for all allies","Cleanses Bleed, Panic and Burn, heals allies"],
"Zivern":["Lowers enemy Strength and Instinct","Intelligence and Instinct up","Chance to Panic all enemies","Allies take less physical and tactical damage","Chance to Overwhelm two enemies"],
"Vermax":["Allies take less fire damage as they weaken","Boosts the ally with the highest Instinct","Stacking physical damage and ally tactical damage","Takes less damage, Strength up","Chance to gain Advantage"],
"Tessarion":["Physical and fire damage up (more when healthy or with Advantage)","Boosts an ally's fire damage","Chance to boost allies' fire damage and physical defense","Intelligence up, boosts an ally's Initiative","Protects and boosts a fire-dealing ally"],
"Tairax":["Weakens an enemy in her lane and boosts herself","Controlled enemies take more damage","Higher Stagger chance, more fire vs controlled enemies","Chance to grant Resistance when enemies Burn","Evasion and fire damage up"],
"Starshower":["Chance to cleanse two allies and grant Evade","Lowers enemy Intelligence and Initiative","Command hits marked enemies much harder, re-marks late","More tactical damage vs the enemy in her lane","Reduces damage taken by adjacent allies"],
"Solstryker":["Stacking Strength cut on all enemies","Lowers two enemies' Strength and Initiative","Chance to Overwhelm an enemy","Strength and Instinct up","Longer Strength and Initiative cut"],
"Antares":["Enemies take more fire and physical damage","Raises his own fire damage","Command adds fire damage vs Slowed enemies","Takes less damage, Intelligence up","Stats up, chance to resist Vulnerable and Weakened"],
"Shimmer":["Boosts ally physical (left) and tactical (right) damage","Takes less damage, Instinct up","Heals two allies (more with Resistance)","Allies receive more healing","Chance to grant an ally physical damage and First Strike"],
"Jagadrix":["Lowers a tactical enemy's tactical damage","Damage and healing up","Chance to Weaken an enemy","Intelligence and Initiative up","More fire vs tactical enemies (double vs Panic)"],
"Bevlorin":["Himself and an ally take less fire damage","Physical and fire damage up","Heals all allies","Strength and healing up","Chance to boost allies' best stat"],
"Shadowrend":["Big Strength and Instinct boost to allies late in the fight","Takes less damage, Initiative up","Chance to grant Advantage to two allies","Allies deal more damage late in the fight","Huge hit on all enemies in round 9"],
"Thunderstrike":["Initiative up, lowers enemy Instinct","Physical damage up","Big physical hit with Bleed","An enemy takes more physical damage","Chance to Stagger an enemy"],
"Vesper":["Boosts the Vanguard's tactical damage","Takes less damage, Initiative up","Chance of Resistance for herself and an ally","Instinct up for all allies","Chance to Confuse an enemy"],
"Arulix":["Chance to Overwhelm or Stagger an enemy","Lowers enemy Strength and Intelligence","Physical hits on two enemies, growing over the fight","Allies take less physical and fire damage","Chance to Weaken an enemy or buff an ally"],
"Nyrena":["Lowers enemy Strength and Initiative","Intelligence and Instinct up for allies","Fire damage up for herself and an ally","Tactical and fire damage up","Allies take less physical damage late and when defending"],
"Dawnseeker":["Boosts ally tactical (left) and fire (right) damage","Allies receive more healing","Big tactical damage and healing early","Initiative up for all allies","Stats up for allies, chance of First Strike early"],
"Arrax":["Big Strength and physical damage burst, lower Instinct","Allies take less tactical and fire damage","Troop-based damage reduction for all allies","Fire Ward stacks for himself and an ally","Enemies take more physical damage"],
}

if __name__ == "__main__":
    cat = json.load(open("catalog.json", encoding="utf-8"))
    for c in cat:
        h = H[c["name"]]
        assert len(h) == 5, c["name"]
        c["habits"] = h
    json.dump(cat, open("catalog.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(cat), "dragons, all have 5 habits")
