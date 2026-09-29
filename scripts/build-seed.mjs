// Generates migrations/0002_seed.sql from the schedule on the current Blogger page
// (minglefreely.blogspot.com/p/trivial-thursdays-on-wrfl-guest-schedule.html, as of 2026-09-28).
// Segment shorthand: [kind, name, url?, note?]   kind: g = guest, m = musical guest, f = feature
import { writeFileSync } from 'node:fs';

const SEASON = 'Fall 2026';
const episodes = [
  ['2026-08-27', [['g', 'Young Entrepreneurship in KY'], ['g', 'Author Maryjean Wall'], ['g', 'Everly Brothers biographer Barry Mazor', 'https://www.amazon.com/Blood-Harmony-Everly-Brothers-Story/dp/0306831732']]],
  ['2026-09-03', [['g', 'Sarabeth Brownrobie, Carnegie Center'], ['g', 'Lexington Art League: Tales from the Near Side'], ['g', 'SCFA Expansive Sounds with Matt Gibson']]],
  ['2026-09-10', [['g', 'League of Women Voters', '', "Nat'l Voter Reg. Day"], ['g', 'Kim Baird, Roots & Heritage Festival', 'https://rootsfestky.com/'], ['g', "KY Theatre's Twelve Lions Festival"], ['g', 'UK SA/VS', 'https://finearts.uky.edu/savs']]],
  ['2026-09-17', [['g', 'Uniting Voices Lexington', 'https://www.unitingvoiceslexington.org/'], ['g', 'Green Room Exchange Presents: Insun Park & Generals'], ['m', 'Carnage the Executioner/TERRELL X & sevenQTRS']]],
  ['2026-09-24', [['g', 'Jad Abumrad of Radiolab!!'], ['g', 'Mecca Live Studio'], ['g', 'Southland Street Fair']]],
  ['2026-10-01', [['g', 'Musician Vanessa Davis'], ['g', 'League of Women Voters', '', 'Voter Reg. Deadline'], ['g', 'Musician Scott Whiddon']]],
  ['2026-10-08', [['g', 'Tree Week Lexington'], ['g', "UK Dept of Theatre & Dance's ANTIGONE"], ['m', 'Cape Verdean singer Lucibela', '', 'on behalf of Greenroom Exchange']]],
  ['2026-10-15', [['g', 'John Winters of PRHBTN'], ['g', 'CivicLex'], ['m', 'Eric McM']]],
  ['2026-10-22', [['g', 'Sarabeth Brownrobie, Carnegie Center'], ['g', 'League of Women Voters', '', 'non-partisan canvass'], ['g', 'LexPhil "Heroes & Villains"'], ['g', 'Thriller', '', 'tent.']]],
  ['2026-10-29', [['g', 'SCFA Presents: Bang On A Can All-Stars!'], ['g', 'League of Women Voters', '', 'early voting'], ['g', 'Filmmaker Daniel Freed']]],
  ['2026-11-05', [['g', 'Author Normandi Ellis'], ["g", "Tahlsound's Willie Nelson Tribute"], ['m', 'Jewelweed']]],
  ['2026-11-12', [['g', `UK Dept of Theatre & Dance's "Almost Maine" by Peter Stone`], ['g', 'UK Fine Arts Professor Doreen Maloney'], ['m', 'Outside the Spotlight']]],
  ['2026-11-19', []],
  ['2026-11-26', [['f', 'A Very Emily Thanksgiving', '', 'A Trivial Thursdays Tradition!']]],
  ['2026-12-03', [['g', 'Steve Johnson, New Song In The Bluegrass Choir', 'https://www.facebook.com/NewSongInTheBluegrass/']]],
  ['2026-12-10', []],
  ['2026-12-17', [['g', 'Uniting Voices Lexington', 'https://www.unitingvoiceslexington.org/']]],
  ['2026-12-24', []],
  ['2026-12-31', []],
  ['2027-01-07', [['g', 'Sarah Katzenmaier, Cardiac Crusade']]],
  ['2027-01-14', []],
  ['2027-01-21', []],
  ['2027-01-28', []],
  ['2027-02-04', [['g', "UK Dept of Theatre & Dance's Collected Stories"]]],
  ['2027-02-11', []],
  ['2027-02-18', [['g', "UK Dept of Theatre & Dance's American Son by Jeremy Gillett"]]],
  ['2027-02-25', []],
];

const q = (s) => `'${String(s ?? '').replace(/'/g, "''")}'`;
const kinds = { g: 'guest', m: 'music', f: 'feature' };
const settings = {
  tagline: "Lexington's award-winning community affairs show, with a heavy bent towards local issues surrounding the simple concept of “let's be nice to each other.” How hard can it be?",
  airtime: 'Every Thursday, 10 a.m. – noon (Eastern)',
  station_name: 'WRFL-FM 88.1',
  station_url: 'https://wrfl.fm',
  facebook_url: 'https://www.facebook.com/mickjeffries',
  host_name: 'Mick Jeffries',
  logo_url: 'https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEj8JAq_RRsqT-DcNLHNJdcnVKYTPKcEW0sLvg5csjUZBUIBsQ-Yj2Zw18z_kYc2P9Nl3L08uVR_URxl-De_VFYkAqohw7HSrnKFJ5eNNN_Q0c6zSezlOmBoqkn_L4kN3BywFpoe_A/s400/TT-just-logo.png',
  current_season: SEASON,
};

let sql = '-- Seed: Fall 2026 schedule as published on the Blogger page (2026-09-28)\n';
for (const [k, v] of Object.entries(settings)) sql += `INSERT OR REPLACE INTO settings (key, value) VALUES (${q(k)}, ${q(v)});\n`;
for (const [date, segs] of episodes) {
  sql += `INSERT INTO episodes (air_date, season) VALUES (${q(date)}, ${q(SEASON)});\n`;
  segs.forEach(([k, name, url = '', note = ''], i) => {
    sql += `INSERT INTO segments (episode_id, position, kind, name, url, note) VALUES ((SELECT id FROM episodes WHERE air_date=${q(date)}), ${i}, ${q(kinds[k])}, ${q(name)}, ${q(url)}, ${q(note)});\n`;
  });
}
writeFileSync(new URL('../migrations/0002_seed.sql', import.meta.url), sql);
console.log(`wrote ${episodes.length} episodes, ${episodes.reduce((n, e) => n + e[1].length, 0)} segments`);
