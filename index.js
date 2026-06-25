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

client.once('ready', () => {
  console.log(`✅ 봇 로그인 완료: ${client.user.tag}`);
  startWatching();
});

client.on('error', (err) => {
  console.error('❌ 클라이언트 오류:', err.message);
});

// 서버 닉네임/유저네임/글로벌네임 중 하나라도 일치하면 찾기
async function findMemberByName(guild, name) {
  const members = await guild.members.fetch();
  const found = members.find(m => {
    const nick = m.nickname || '';
    const username = m.user.username || '';
    const globalName = m.user.globalName || '';
    return nick === name || username === name || globalName === name;
  });
  return found || null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function moveTeam(guild, players, channelId, teamLabel) {
  for (const p of players) {
    try {
      const member = await findMemberByName(guild, p.name);
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
      await member.voice.setChannel(channelId);
      console.log(`✅ [${teamLabel}] ${p.name} 님 이동 완료`);
      // 디스코드 rate limit 방지를 위해 각 이동 사이에 1.5초 대기
      await sleep(4000);
    } catch (err) {
      console.error(`❌ [${teamLabel}] ${p.name} 이동 실패:`, err.message);
      // 실패해도 다음 멤버 처리 전에 약간 대기
      await sleep(4000);
    }
  }
}

function startWatching() {
  console.log('👀 팀 편성 결과 감지 시작... (5초마다 확인)');
  setInterval(async () => {
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

      console.log('🎮 새로운 팀 편성 감지! 멤버 이동 시작...');

      const guild = await client.guilds.fetch(GUILD_ID);
      await moveTeam(guild, result.team1, BLUE_CHANNEL_ID, '블루팀');
      await moveTeam(guild, result.team2, RED_CHANNEL_ID, '레드팀');

      console.log('✅ 팀 이동 처리 완료!');
    } catch (err) {
      console.error('폴링 오류:', err.message);
    }
  }, 5000);
}

client.login(DISCORD_BOT_TOKEN).catch(err => {
  console.error('❌ 로그인 실패:', err.message);
  console.error('DISCORD_BOT_TOKEN 환경변수가 올바른지 확인해주세요.');
});
