function PostMessage(data){
  window.postMessage(data)
}
if (localStorage.getItem('keepSession') && localStorage.getItem('keepSession') === 'true') {
  console.log('保留session --- ');
} else {
  console.log('清除session --- ');
  localStorage.removeItem("chat-next-web-store");
}

