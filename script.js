const socket = io();

let localVideo = document.getElementById("localVideo");
let remoteVideo = document.getElementById("remoteVideo");

let peer = new RTCPeerConnection();

navigator.mediaDevices.getUserMedia({video:true,audio:true})
.then(stream=>{
    localVideo.srcObject = stream;

    stream.getTracks().forEach(track=>{
        peer.addTrack(track,stream);
    });
});

peer.ontrack = e=>{
    remoteVideo.srcObject = e.streams[0];
};

peer.onicecandidate = e=>{
    if(e.candidate){
        socket.emit("candidate",e.candidate);
    }
};

socket.on("candidate",candidate=>{
    peer.addIceCandidate(new RTCIceCandidate(candidate));
});

async function startCall(){

let offer = await peer.createOffer();
await peer.setLocalDescription(offer);

socket.emit("offer",offer);

}

socket.on("offer",async offer=>{

await peer.setRemoteDescription(new RTCSessionDescription(offer));

let answer = await peer.createAnswer();
await peer.setLocalDescription(answer);

socket.emit("answer",answer);

});

socket.on("answer",async answer=>{
await peer.setRemoteDescription(new RTCSessionDescription(answer));
});

startCall();
