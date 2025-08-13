using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Swashbuckle.AspNetCore.Annotations;
using Example.Api.DTOs;
using Example.Api.Services;
using Example.Api.Models;

namespace Example.Api.Controllers
{
    /// <summary>
    /// Controller for managing user operations including CRUD operations and profile management.
    /// Provides comprehensive user management functionality with validation and error handling.
    /// </summary>
    [ApiController]
    [Route("api/v1/[controller]")]
    [Produces("application/json")]
    [SwaggerTag("User Management", "Operations for managing users and their profiles")]
    public class UserController : ControllerBase
    {
        private readonly IUserService _userService;
        private readonly ILogger<UserController> _logger;

        /// <summary>
        /// Initializes a new instance of the UserController.
        /// </summary>
        /// <param name="userService">Service for user operations</param>
        /// <param name="logger">Logger instance</param>
        public UserController(IUserService userService, ILogger<UserController> logger)
        {
            _userService = userService ?? throw new ArgumentNullException(nameof(userService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }

        /// <summary>
        /// Retrieve a user by their unique identifier.
        /// Returns complete user information including profile data and account status.
        /// </summary>
        /// <param name="id">The unique user identifier (must be positive integer)</param>
        /// <returns>User details including profile information</returns>
        /// <response code="200">User found and returned successfully</response>
        /// <response code="400">Invalid user ID provided</response>
        /// <response code="404">User with specified ID not found</response>
        [HttpGet("{id:int:min(1)}")]
        [SwaggerOperation(
            Summary = "Get user by ID",
            Description = "Retrieve detailed user information including profile and account status",
            OperationId = "GetUser",
            Tags = new[] { "Users" }
        )]
        [SwaggerResponse(StatusCodes.Status200OK, "User retrieved successfully", typeof(UserDTO))]
        [SwaggerResponse(StatusCodes.Status400BadRequest, "Invalid user ID", typeof(ErrorResponse))]
        [SwaggerResponse(StatusCodes.Status404NotFound, "User not found", typeof(ErrorResponse))]
        public async Task<ActionResult<UserDTO>> GetUser([FromRoute] int id)
        {
            _logger.LogInformation("Retrieving user with ID: {UserId}", id);

            try
            {
                var user = await _userService.GetUserByIdAsync(id);
                return Ok(user);
            }
            catch (UserNotFoundException ex)
            {
                _logger.LogWarning("User not found: {UserId}", id);
                return NotFound(new ErrorResponse { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving user: {UserId}", id);
                return StatusCode(500, new ErrorResponse { Message = "Internal server error" });
            }
        }

        /// <summary>
        /// Create a new user account with validation.
        /// Validates email uniqueness, password strength, and required fields.
        /// Automatically sets default preferences and sends welcome notification.
        /// </summary>
        /// <param name="request">User creation data with validation constraints</param>
        /// <returns>Created user information</returns>
        /// <response code="201">User created successfully</response>
        /// <response code="400">Invalid request data or validation errors</response>
        /// <response code="409">User with this email already exists</response>
        [HttpPost]
        [SwaggerOperation(
            Summary = "Create new user",
            Description = "Create a new user account with validation and default settings",
            OperationId = "CreateUser",
            Tags = new[] { "Users" }
        )]
        [SwaggerResponse(StatusCodes.Status201Created, "User created successfully", typeof(UserDTO))]
        [SwaggerResponse(StatusCodes.Status400BadRequest, "Validation errors", typeof(ValidationErrorResponse))]
        [SwaggerResponse(StatusCodes.Status409Conflict, "User already exists", typeof(ErrorResponse))]
        public async Task<ActionResult<UserDTO>> CreateUser([FromBody] CreateUserRequest request)
        {
            _logger.LogInformation("Creating new user with email: {Email}", request.Email);

            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var user = await _userService.CreateUserAsync(request);
                _logger.LogInformation("User created successfully: {UserId}", user.Id);
                
                return CreatedAtAction(
                    nameof(GetUser),
                    new { id = user.Id },
                    user
                );
            }
            catch (UserAlreadyExistsException ex)
            {
                _logger.LogWarning("Attempt to create duplicate user: {Email}", request.Email);
                return Conflict(new ErrorResponse { Message = ex.Message });
            }
            catch (ValidationException ex)
            {
                _logger.LogWarning("Validation error creating user: {Message}", ex.Message);
                return BadRequest(new ErrorResponse { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating user: {Email}", request.Email);
                return StatusCode(500, new ErrorResponse { Message = "Internal server error" });
            }
        }

        /// <summary>
        /// Update an existing user's information.
        /// Supports partial updates - only provided fields will be updated.
        /// Validates email uniqueness if email is being changed.
        /// </summary>
        /// <param name="id">User identifier to update</param>
        /// <param name="request">Updated user data (partial updates supported)</param>
        /// <returns>Updated user information</returns>
        /// <response code="200">User updated successfully</response>
        /// <response code="400">Invalid request data</response>
        /// <response code="404">User not found</response>
        /// <response code="409">Email already taken by another user</response>
        [HttpPut("{id:int:min(1)}")]
        [SwaggerOperation(
            Summary = "Update user information",
            Description = "Update user with partial data, validates email uniqueness",
            OperationId = "UpdateUser",
            Tags = new[] { "Users" }
        )]
        [SwaggerResponse(StatusCodes.Status200OK, "User updated successfully", typeof(UserDTO))]
        [SwaggerResponse(StatusCodes.Status400BadRequest, "Invalid request data", typeof(ErrorResponse))]
        [SwaggerResponse(StatusCodes.Status404NotFound, "User not found", typeof(ErrorResponse))]
        [SwaggerResponse(StatusCodes.Status409Conflict, "Email conflict", typeof(ErrorResponse))]
        public async Task<ActionResult<UserDTO>> UpdateUser([FromRoute] int id, [FromBody] UpdateUserRequest request)
        {
            _logger.LogInformation("Updating user: {UserId}", id);

            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var user = await _userService.UpdateUserAsync(id, request);
                return Ok(user);
            }
            catch (UserNotFoundException ex)
            {
                _logger.LogWarning("User not found for update: {UserId}", id);
                return NotFound(new ErrorResponse { Message = ex.Message });
            }
            catch (UserAlreadyExistsException ex)
            {
                _logger.LogWarning("Email conflict during user update: {UserId}", id);
                return Conflict(new ErrorResponse { Message = ex.Message });
            }
            catch (ValidationException ex)
            {
                _logger.LogWarning("Validation error updating user: {Message}", ex.Message);
                return BadRequest(new ErrorResponse { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating user: {UserId}", id);
                return StatusCode(500, new ErrorResponse { Message = "Internal server error" });
            }
        }

        /// <summary>
        /// Soft delete a user account.
        /// Marks the user as inactive but preserves data for audit purposes.
        /// User can be reactivated by administrator if needed.
        /// </summary>
        /// <param name="id">User identifier to delete</param>
        /// <returns>No content on successful deletion</returns>
        /// <response code="204">User deleted successfully</response>
        /// <response code="400">Invalid user ID</response>
        /// <response code="404">User not found</response>
        [HttpDelete("{id:int:min(1)}")]
        [SwaggerOperation(
            Summary = "Delete user account",
            Description = "Soft delete user account (marks as inactive, preserves data)",
            OperationId = "DeleteUser",
            Tags = new[] { "Users" }
        )]
        [SwaggerResponse(StatusCodes.Status204NoContent, "User deleted successfully")]
        [SwaggerResponse(StatusCodes.Status400BadRequest, "Invalid user ID", typeof(ErrorResponse))]
        [SwaggerResponse(StatusCodes.Status404NotFound, "User not found", typeof(ErrorResponse))]
        public async Task<IActionResult> DeleteUser([FromRoute] int id)
        {
            _logger.LogInformation("Deleting user: {UserId}", id);

            try
            {
                await _userService.SoftDeleteUserAsync(id);
                return NoContent();
            }
            catch (UserNotFoundException ex)
            {
                _logger.LogWarning("User not found for deletion: {UserId}", id);
                return NotFound(new ErrorResponse { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error deleting user: {UserId}", id);
                return StatusCode(500, new ErrorResponse { Message = "Internal server error" });
            }
        }

        /// <summary>
        /// Get paginated list of users with filtering options.
        /// Supports search by name/email, active status filtering, and custom sorting.
        /// Results are paginated for optimal performance with large datasets.
        /// </summary>
        /// <param name="search">Optional search term for name/email filtering</param>
        /// <param name="active">Optional filter by active status</param>
        /// <param name="page">Page number (1-based, default: 1)</param>
        /// <param name="pageSize">Number of items per page (default: 10, max: 100)</param>
        /// <param name="sortBy">Sort field (default: id)</param>
        /// <param name="sortOrder">Sort direction (asc/desc, default: asc)</param>
        /// <returns>Paginated list of users</returns>
        /// <response code="200">Users retrieved successfully</response>
        /// <response code="400">Invalid pagination or filter parameters</response>
        [HttpGet]
        [SwaggerOperation(
            Summary = "List users with pagination",
            Description = "Get paginated list of users with search and filtering capabilities",
            OperationId = "ListUsers",
            Tags = new[] { "Users" }
        )]
        [SwaggerResponse(StatusCodes.Status200OK, "Users retrieved successfully", typeof(UserListResponse))]
        [SwaggerResponse(StatusCodes.Status400BadRequest, "Invalid parameters", typeof(ErrorResponse))]
        public async Task<ActionResult<UserListResponse>> ListUsers(
            [FromQuery] string? search = null,
            [FromQuery] bool? active = null,
            [FromQuery, Range(1, int.MaxValue)] int page = 1,
            [FromQuery, Range(1, 100)] int pageSize = 10,
            [FromQuery] string sortBy = "id",
            [FromQuery] string sortOrder = "asc")
        {
            _logger.LogInformation(
                "Listing users - Page: {Page}, Size: {PageSize}, Search: {Search}, Active: {Active}",
                page, pageSize, search, active);

            try
            {
                var filters = new UserFilters
                {
                    Search = search,
                    Active = active,
                    Page = page,
                    PageSize = pageSize,
                    SortBy = sortBy,
                    SortOrder = sortOrder
                };

                var result = await _userService.ListUsersAsync(filters);
                return Ok(result);
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning("Invalid filter parameters: {Message}", ex.Message);
                return BadRequest(new ErrorResponse { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error listing users");
                return StatusCode(500, new ErrorResponse { Message = "Internal server error" });
            }
        }

        /// <summary>
        /// Get detailed user profile information.
        /// Returns comprehensive profile data including bio, avatar, preferences, and activity.
        /// </summary>
        /// <param name="id">User identifier</param>
        /// <returns>Detailed user profile information</returns>
        /// <response code="200">Profile retrieved successfully</response>
        /// <response code="404">User not found</response>
        [HttpGet("{id:int:min(1)}/profile")]
        [SwaggerOperation(
            Summary = "Get user profile",
            Description = "Retrieve detailed user profile including preferences and activity",
            OperationId = "GetUserProfile",
            Tags = new[] { "Users", "Profile" }
        )]
        [SwaggerResponse(StatusCodes.Status200OK, "Profile retrieved successfully", typeof(UserProfileDTO))]
        [SwaggerResponse(StatusCodes.Status404NotFound, "User not found", typeof(ErrorResponse))]
        public async Task<ActionResult<UserProfileDTO>> GetUserProfile([FromRoute] int id)
        {
            _logger.LogInformation("Retrieving profile for user: {UserId}", id);

            try
            {
                var profile = await _userService.GetUserProfileAsync(id);
                return Ok(profile);
            }
            catch (UserNotFoundException ex)
            {
                _logger.LogWarning("User not found for profile: {UserId}", id);
                return NotFound(new ErrorResponse { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving user profile: {UserId}", id);
                return StatusCode(500, new ErrorResponse { Message = "Internal server error" });
            }
        }

        /// <summary>
        /// Update user profile information and preferences.
        /// Updates bio, avatar URL, notification preferences, and custom settings.
        /// </summary>
        /// <param name="id">User identifier</param>
        /// <param name="request">Profile update data</param>
        /// <returns>Updated profile information</returns>
        /// <response code="200">Profile updated successfully</response>
        /// <response code="400">Invalid profile data</response>
        /// <response code="404">User not found</response>
        [HttpPut("{id:int:min(1)}/profile")]
        [SwaggerOperation(
            Summary = "Update user profile",
            Description = "Update user profile information and preferences",
            OperationId = "UpdateUserProfile",
            Tags = new[] { "Users", "Profile" }
        )]
        [SwaggerResponse(StatusCodes.Status200OK, "Profile updated successfully", typeof(UserProfileDTO))]
        [SwaggerResponse(StatusCodes.Status400BadRequest, "Invalid profile data", typeof(ErrorResponse))]
        [SwaggerResponse(StatusCodes.Status404NotFound, "User not found", typeof(ErrorResponse))]
        public async Task<ActionResult<UserProfileDTO>> UpdateUserProfile(
            [FromRoute] int id,
            [FromBody] UpdateUserProfileRequest request)
        {
            _logger.LogInformation("Updating profile for user: {UserId}", id);

            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var profile = await _userService.UpdateUserProfileAsync(id, request);
                return Ok(profile);
            }
            catch (UserNotFoundException ex)
            {
                _logger.LogWarning("User not found for profile update: {UserId}", id);
                return NotFound(new ErrorResponse { Message = ex.Message });
            }
            catch (ValidationException ex)
            {
                _logger.LogWarning("Validation error updating profile: {Message}", ex.Message);
                return BadRequest(new ErrorResponse { Message = ex.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating user profile: {UserId}", id);
                return StatusCode(500, new ErrorResponse { Message = "Internal server error" });
            }
        }
    }
}
