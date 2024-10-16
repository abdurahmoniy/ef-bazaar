import React from 'react';
import './style.css'

const CopyBox = () => {
  const copyText = () => {
    const textToCopy = "Post Your eFootball Account – Beta";
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert("Copied to clipboard!");
    });
  };

  return (
    <div className="copy-box">
      Post Your eFootball Ac
      <button className="copy-button" onClick={copyText}><i className="fas fa-copy"></i></button>
    </div>
  );
};

export default CopyBox;
