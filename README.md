# 내전 매니저 디스코드 봇

팀 편성이 완료되면 자동으로 블루팀/레드팀 멤버를 각 음성 채널로 이동시켜주는 봇입니다.

## 작동 방식

1. 사이트에서 팀 균형 맞추기 → 10초 후 팀 확정
2. 결과가 Supabase `session` 테이블의 `result` 컬럼에 저장됨
3. 이 봇이 5초마다 해당 컬럼을 확인 (폴링)
4. 새로운 팀 편성 감지 시, 팀원들의 디스코드 서버 닉네임을 찾아서 음성 채널로 이동

## 사전 준비 (중요)

- 모든 멤버의 **디스코드 서버 닉네임**이 사이트의 소환사명(본명)과 정확히 일치해야 합니다.
- 팀 편성 전에 모든 멤버가 **음성 채널(어디든)에 입장**해 있어야 합니다.

---

## Oracle Cloud Always Free에 배포하기

### 1단계: Oracle Cloud 계정 생성

1. https://www.oracle.com/cloud/free/ 접속 → Start for free
2. 이메일, 본인정보, 신용카드(본인 인증용, 과금 안 됨) 입력
3. 가입 완료 후 콘솔 로그인

### 2단계: 무료 VM 인스턴스 생성

1. 콘솔 좌측 메뉴 → **Compute** → **Instances** → **Create Instance**
2. Image: **Ubuntu 22.04** 선택
3. Shape: **Always Free eligible** 라벨이 붙은 것 선택 (예: VM.Standard.A1.Flex, 1 OCPU / 6GB)
4. SSH 키: **자동 생성 후 개인 키(.key) 다운로드** (나중에 접속할 때 필요)
5. Create 클릭 → 몇 분 후 인스턴스 실행됨

### 3단계: 서버 접속

터미널(Mac/Linux) 또는 PowerShell(Windows)에서:

```bash
ssh -i 다운로드한키파일.key ubuntu@인스턴스의_Public_IP
```

### 4단계: 서버에 Node.js 설치

접속 후 서버 안에서:

```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
node -v   # 버전 확인
```

### 5단계: 봇 코드 가져오기

```bash
git clone https://github.com/본인계정/lol-naegeon-bot.git
cd lol-naegeon-bot
npm install
```

### 6단계: 환경변수 설정

```bash
nano .env
```

아래 내용을 입력 (실제 값으로 채우기):

```
DISCORD_BOT_TOKEN=실제토큰
GUILD_ID=실제서버ID
BLUE_CHANNEL_ID=실제채널ID
RED_CHANNEL_ID=실제채널ID
SUPABASE_URL=실제URL
SUPABASE_KEY=실제키
```

저장: `Ctrl+O` → Enter → `Ctrl+X`

### 7단계: 24시간 실행 (PM2 사용)

서버가 재부팅되거나 봇이 죽어도 자동으로 재시작되도록 PM2를 사용합니다.

```bash
sudo npm install -g pm2
pm2 start index.js --name naegeon-bot
pm2 save
pm2 startup   # 출력되는 명령어를 복사해서 한 번 더 실행
```

### 8단계: 로그 확인

```bash
pm2 logs naegeon-bot
```

`✅ 봇 로그인 완료`가 뜨면 정상 작동 중입니다!

---

## 문제 해결

- **멤버를 찾을 수 없음 로그가 뜰 때**: 디스코드 서버 닉네임과 사이트 소환사명이 정확히 일치하는지 확인
- **음성 채널에 없어요 로그가 뜰 때**: 팀 편성 전 모든 멤버가 음성 채널에 입장했는지 확인
- **로그인 실패**: `.env`의 `DISCORD_BOT_TOKEN`이 올바른지 확인 (Reset Token으로 재발급 가능)

## 보안 주의사항

⚠️ 봇 토큰과 Supabase Key는 절대 외부에 노출하면 안 됩니다.
- `.env` 파일은 `.gitignore`에 포함되어 있어 GitHub에 올라가지 않습니다.
- 토큰이 노출된 적이 있다면 즉시 Discord Developer Portal에서 Reset Token 하세요.
