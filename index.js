// 내전 매니저 디스코드 봇
// 팀 편성 결과를 Supabase에서 감지해서 음성 채널 자동 이동

// Node.js 20에서 Supabase realtime이 사용할 WebSocket 폴리필
global.WebSocket = require('ws');

const { Client, GatewayIntentBits } = require('discord.js');
const { createClient } = require('@supabase/supabase-js');

// ===== 설정값 (환경변수에서 가져옴) =====
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const BLUE_CHANNEL_ID = process.env.BLUE_CHANNEL_ID;
const RED_CHANNEL_ID = process.env.RED_CHANNEL_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
// =======================================

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

let lastResultJson = null; // 중복 이동 방지용
let isProcessing = false; // 이동 처리 중 중복 폴링 방지

client.once('ready', () => {
  console.log(`✅ 봇 로그인 완료: ${client.user.tag}`);
  startWatching();
});

client.on('error', (err) => {
  console.error('❌ 클라이언트 오류:', err.message);
});

// 서버 닉네임/유저네임/글로벌네임 중 하나라도 일치하면 찾기 (캐시된 멤버 목록 사용)
function findMemberInCache(membersCache, name) {
  return membersCache.find(m => {
    const nick = m.nickname || '';
    const username = m.user.username || '';
    const globalName = m.user.globalName || '';
    return nick === name || username === name || globalName === name;
  }) || null;
}

async function fetchMembersWithRetry(guild, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const members = await guild.members.fetch();
      return [...members.values()];
    } catch (err) {
      const retryAfterMatch = /Retry after ([\d.]+) seconds/i.exec(err.message || '');
      if (retryAfterMatch) {
        const waitMs = Math.ceil(parseFloat(retryAfterMatch[1]) * 1000) + 500;
        console.log(`⏳ 멤버 목록 조회 rate limit, ${(waitMs/1000).toFixed(1)}초 대기 후 재시도`);
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }
  throw new Error('멤버 목록 조회 재시도 횟수 초과');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function moveOneMember(member, channelId, teamLabel, name, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await member.voice.setChannel(channelId);
      console.log(`✅ [${teamLabel}] ${name} 님 이동 완료`);
      return true;
    } catch (err) {
      // 디스코드 rate limit 에러면 알려준 시간만큼 정확히 기다린 후 재시도
      const retryAfterMatch = /Retry after ([\d.]+) seconds/i.exec(err.message || '');
      if (retryAfterMatch) {
        const waitMs = Math.ceil(parseFloat(retryAfterMatch[1]) * 1000) + 500; // 여유 0.5초 추가
        console.log(`⏳ [${teamLabel}] ${name} 님 rate limit, ${(waitMs/1000).toFixed(1)}초 대기 후 재시도 (시도 ${attempt + 1}/${maxRetries + 1})`);
        await sleep(waitMs);
        continue;
      }
      console.error(`❌ [${teamLabel}] ${name} 이동 실패:`, err.message);
      return false;
    }
  }
  console.error(`❌ [${teamLabel}] ${name} 이동 실패: 재시도 횟수 초과`);
  return false;
}

async function moveTeam(guild, players, channelId, teamLabel, membersCache) {
  for (const p of players) {
    const member = findMemberInCache(membersCache, p.name);
    if (!member) {
      console.log(`⚠️ [${teamLabel}] 멤버를 찾을 수 없음: ${p.name}`);
      continue;
    }
    if (!member.voice.channelId) {
      console.log(`⚠️ [${teamLabel}] ${p.name} 님은 음성 채널에 없어요`);
      continue;
    }
    if (member.voice.channelId === channelId) {
      console.log(`ℹ️ [${teamLabel}] ${p.name} 님은 이미 해당 채널에 있어요`);
      continue;
    }
    await moveOneMember(member, channelId, teamLabel, p.name);
    // 각 멤버 이동 사이에 기본 대기 (성공/실패 무관)
    await sleep(7000);
  }
}

function startWatching() {
  console.log('👀 팀 편성 결과 감지 시작... (5초마다 확인)');
  setInterval(async () => {
    if (isProcessing) return; // 이전 이동 작업이 아직 진행 중이면 건너뜀
    try {
      const { data: sess, error } = await supabase
        .from('session')
        .select('result')
        .eq('id', 1)
        .single();

      if (error) {
        console.error('Supabase 조회 오류:', error.message);
        return;
      }
      if (!sess || !sess.result) return;

      const resultJson = JSON.stringify(sess.result);
      if (resultJson === lastResultJson) return;
      lastResultJson = resultJson;

      const result = sess.result;
      if (!result.team1 || !result.team2) return;

      isProcessing = true;
      console.log('🎮 새로운 팀 편성 감지! 멤버 이동 시작...');

      const guild = await client.guilds.fetch(GUILD_ID);
      const membersCache = await fetchMembersWithRetry(guild);
      await moveTeam(guild, result.team1, BLUE_CHANNEL_ID, '블루팀', membersCache);
      await moveTeam(guild, result.team2, RED_CHANNEL_ID, '레드팀', membersCache);

      console.log('✅ 팀 이동 처리 완료!');
    } catch (err) {
      console.error('폴링 오류:', err.message);
    } finally {
      isProcessing = false;
    }
  }, 5000);
}

client.login(DISCORD_BOT_TOKEN).catch(err => {
  console.error('❌ 로그인 실패:', err.message);
  console.error('DISCORD_BOT_TOKEN 환경변수가 올바른지 확인해주세요.');
});
