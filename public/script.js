// public/script.js

// 마지막으로 확인한 메시지의 ID (서버가 DB에서 삭제할 때 기준이 됩니다.)
let last_message_id = 0; 

// 메시지를 채팅 로그에 추가하는 함수
function appendMessage(sender, content) {
    const log = document.getElementById('chat-log');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.textContent = `${sender}: ${content}`;
    log.appendChild(messageDiv);
    log.scrollTop = log.scrollHeight; // 스크롤을 맨 아래로 이동
}

// 메시지 전송 처리
function sendMessage() {
    const sender = document.getElementById('sender-input').value || '익명';
    const content = document.getElementById('message-input').value;

    if (!content.trim()) return;

    // ⭐️ 서버의 실제 IP 주소와 포트(3000)를 사용하도록 수정
    fetch('http://172.16.1.83:3000/send', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: sender, content: content })
    })
    
    if (!content.trim()) return;

    fetch('/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: sender, content: content })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('message-input').value = ''; // 입력창 비우기
            // 보낸 메시지는 클라이언트 화면에 즉시 출력
            appendMessage(`나 (${sender})`, content); 
        } else {
            alert('메시지 전송 실패: ' + data.message);
        }
    })
    .catch(error => console.error('Error sending message:', error));
}

// 새 메시지를 확인하고 가져오는 롱 폴링 함수
function checkForNewMessages() {
    // 롱 폴링 요청을 보냄
    fetch(`/get_new_messages?last_id=${last_message_id}`)
        .then(response => response.json())
        .then(data => {
            if (data.messages && data.messages.length > 0) {
                // 새 메시지가 있을 경우
                data.messages.forEach(msg => {
                    appendMessage(msg.sender, msg.content);
                });
                // 마지막 ID를 업데이트
                last_message_id = data.last_id; 
            }
            
            // 새 메시지 수신 여부 또는 타임아웃 여부와 상관없이 다시 롱 폴링 시작
            checkForNewMessages(); 
        })
        .catch(error => {
            console.error('Error fetching new messages:', error);
            // 에러 발생 시 3초 후 재시도
            setTimeout(checkForNewMessages, 3000); 
        });
}

// 페이지 로드 시 롱 폴링 시작
window.onload = checkForNewMessages;