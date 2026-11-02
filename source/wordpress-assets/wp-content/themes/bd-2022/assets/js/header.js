document.addEventListener('DOMContentLoaded', function(e) {

	window.setTimeout(() => {
		document.querySelector('.nav-container input[type="checkbox"]').checked = false;
	}, 300)

	const header = document.getElementById('masthead');
	const spacing = document.getElementById('spacing');
	var headerHeight = header.offsetHeight;
	//plugins causing issues with height resizing so we set it manually here
	// var headerHeight = 116;
	spacing.style.height = headerHeight + "px";
	
	window.addEventListener('scroll', function () {
		let getScrollposition = window.scrollY;
		if (getScrollposition > headerHeight) {
			header.classList.add("sticky");
			spacing.style.height = headerHeight + "px"
		} else {
			header.classList.remove("sticky");
			spacing.style.height = headerHeight + "px";
		}
	});
	
});